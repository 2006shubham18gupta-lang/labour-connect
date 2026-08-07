/**
 * ============================================================
 * SHRAMIK SETU — LIVE LOCATION SERVICE
 * Production-ready GPS tracking with Supabase integration
 * ============================================================
 * 
 * Handles:
 * - Browser GPS permission flow with retry UI
 * - Continuous watchPosition tracking
 * - Smart upsert to user_locations table (never duplicates)
 * - Online/offline status management
 * - Automatic cleanup on logout/page unload
 * - Error handling for all edge cases
 */

const LocationService = (function () {
  'use strict';

  // ── Configuration ──────────────────────────────────────────
  const CONFIG = {
    UPDATE_INTERVAL_MS: 10000,          // Force update every 10 seconds
    OFFLINE_THRESHOLD_MS: 2 * 60 * 1000, // 2 minutes = offline
    MIN_DISTANCE_METERS: 5,              // Minimum movement to trigger update
    GEOLOCATION_OPTIONS: {
      enableHighAccuracy: true,
      maximumAge: 0,
      timeout: 15000,
    },
    MAX_RETRY_ATTEMPTS: 3,
    RETRY_DELAY_MS: 2000,
  };

  // ── Internal State ─────────────────────────────────────────
  let _watchId = null;
  let _userId = null;
  let _userRole = null;
  let _userName = null;
  let _supabase = null;
  let _lastSentLocation = null;
  let _lastSentTime = 0;
  let _intervalId = null;
  let _latestPosition = null;
  let _isInitialized = false;
  let _permissionDenied = false;
  let _onPermissionDenied = null;
  let _onPermissionGranted = null;
  let _onLocationUpdate = null;
  let _onError = null;
  let _firstUpdateSent = false;
  let _retryCount = 0;

  // ── Haversine Distance (meters) ────────────────────────────
  function _haversineDistance(lat1, lon1, lat2, lon2) {
    const R = 6371000;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  // ── Check if Location Has Changed Significantly ────────────
  function _hasLocationChanged(newPos) {
    if (!_lastSentLocation) return true;

    const distance = _haversineDistance(
      _lastSentLocation.latitude,
      _lastSentLocation.longitude,
      newPos.coords.latitude,
      newPos.coords.longitude
    );

    return distance >= CONFIG.MIN_DISTANCE_METERS;
  }

  // ── Ensure user_locations row exists (upsert) ──────────────
  async function _upsertLocation(position, forceUpdate) {
    if (!_supabase || !_userId) {
      console.warn('[LocationService] Cannot upsert: missing supabase or userId');
      return;
    }

    if (!position || !position.coords) {
      console.warn('[LocationService] Cannot upsert: invalid position object');
      return;
    }

    const now = Date.now();
    const locationChanged = _hasLocationChanged(position);
    const timeElapsed = now - _lastSentTime >= CONFIG.UPDATE_INTERVAL_MS;

    // On first update, always send regardless of throttle
    if (!forceUpdate && _firstUpdateSent && !locationChanged && !timeElapsed) {
      return;
    }

    const lat = position.coords.latitude;
    const lng = position.coords.longitude;

    console.log(`[LocationService] 📤 Preparing upsert: userId=${_userId}, lat=${lat.toFixed(6)}, lng=${lng.toFixed(6)}, role=${_userRole}`);

    const payload = {
      user_id: _userId,
      role: _userRole || 'customer',
      latitude: lat,
      longitude: lng,
      accuracy: position.coords.accuracy || null,
      heading: position.coords.heading || null,
      speed: position.coords.speed || null,
      online_status: true,
      last_updated: new Date().toISOString(),
    };

    try {
      // First, try upsert (most efficient path)
      const { data, error } = await _supabase
        .from('user_locations')
        .upsert(payload, { onConflict: 'user_id' })
        .select();

      if (error) {
        console.error('[LocationService] ❌ Upsert error:', error.message, error.details, error.hint);
        
        // If upsert failed, try a two-step approach: check if row exists, then insert or update
        if (error.message && (error.message.includes('violates') || error.message.includes('constraint') || error.code === '23505')) {
          console.log('[LocationService] 🔄 Retrying with explicit update...');
          const { error: updateError } = await _supabase
            .from('user_locations')
            .update({
              latitude: lat,
              longitude: lng,
              accuracy: payload.accuracy,
              heading: payload.heading,
              speed: payload.speed,
              online_status: true,
              last_updated: payload.last_updated,
            })
            .eq('user_id', _userId);

          if (updateError) {
            console.error('[LocationService] ❌ Update fallback also failed:', updateError.message);
            if (_onError) _onError('database', updateError.message);
            return;
          }
          console.log('[LocationService] ✅ Update fallback succeeded');
        } else if (error.message && error.message.includes('does not exist')) {
          // Table doesn't exist — this is the most critical error
          console.error('[LocationService] ❌ CRITICAL: user_locations table does not exist! Please run LIVE_LOCATION_SETUP.sql');
          if (_onError) _onError('table_missing', 'user_locations table does not exist');
          return;
        } else {
          // Try insert as a new row
          console.log('[LocationService] 🔄 Retrying with explicit insert...');
          const { error: insertError } = await _supabase
            .from('user_locations')
            .insert([payload]);

          if (insertError) {
            console.error('[LocationService] ❌ Insert fallback failed:', insertError.message);
            
            // Last resort: try update without insert
            const { error: lastResortError } = await _supabase
              .from('user_locations')
              .update({
                latitude: lat,
                longitude: lng,
                accuracy: payload.accuracy,
                heading: payload.heading,
                speed: payload.speed,
                online_status: true,
                last_updated: payload.last_updated,
                role: payload.role,
              })
              .eq('user_id', _userId);

            if (lastResortError) {
              console.error('[LocationService] ❌ All attempts failed:', lastResortError.message);
              if (_onError) _onError('database', lastResortError.message);
              return;
            }
            console.log('[LocationService] ✅ Last resort update succeeded');
          } else {
            console.log('[LocationService] ✅ Insert fallback succeeded');
          }
        }
      } else {
        console.log(`[LocationService] ✅ Location saved: ${lat.toFixed(5)}, ${lng.toFixed(5)}`);
      }

      // Update tracking state
      _lastSentLocation = {
        latitude: lat,
        longitude: lng,
      };
      _lastSentTime = now;
      _firstUpdateSent = true;
      _retryCount = 0;

      if (_onLocationUpdate) {
        _onLocationUpdate({
          latitude: lat,
          longitude: lng,
          accuracy: position.coords.accuracy,
          heading: position.coords.heading,
          speed: position.coords.speed,
        });
      }

      // Fire permission granted callback on first success
      if (_onPermissionGranted && !_permissionDenied) {
        _onPermissionGranted();
      }
    } catch (err) {
      console.error('[LocationService] ❌ Network/unexpected error:', err);
      _retryCount++;
      
      if (_retryCount <= CONFIG.MAX_RETRY_ATTEMPTS) {
        console.log(`[LocationService] 🔄 Retry attempt ${_retryCount}/${CONFIG.MAX_RETRY_ATTEMPTS} in ${CONFIG.RETRY_DELAY_MS}ms...`);
        setTimeout(() => _upsertLocation(position, true), CONFIG.RETRY_DELAY_MS);
      } else {
        console.error('[LocationService] ❌ Max retries reached. Giving up for this cycle.');
        _retryCount = 0;
        if (_onError) _onError('network', err.message);
      }
    }
  }

  // ── watchPosition Success Callback ─────────────────────────
  function _onPositionSuccess(position) {
    _latestPosition = position;
    _permissionDenied = false;

    console.log(`[LocationService] 🛰️ GPS fix received: lat=${position.coords.latitude.toFixed(6)}, lng=${position.coords.longitude.toFixed(6)}, accuracy=${(position.coords.accuracy || 0).toFixed(1)}m`);

    // Remove permission denied UI if it exists
    _removePermissionUI();

    _upsertLocation(position, !_firstUpdateSent);
  }

  // ── watchPosition Error Callback ───────────────────────────
  function _onPositionError(error) {
    console.warn('[LocationService] ⚠️ GPS Error:', error.message, '(code:', error.code, ')');

    switch (error.code) {
      case error.PERMISSION_DENIED:
        _permissionDenied = true;
        _showPermissionDeniedUI();
        if (_onPermissionDenied) _onPermissionDenied();
        break;

      case error.POSITION_UNAVAILABLE:
        console.warn('[LocationService] GPS hardware unavailable');
        if (_onError) _onError('gps_unavailable', 'GPS position unavailable');
        break;

      case error.TIMEOUT:
        console.warn('[LocationService] GPS timeout, retrying...');
        // Retry after a short delay
        setTimeout(() => {
          if (_isInitialized && _userId) {
            _startWatching();
          }
        }, 3000);
        break;
    }
  }

  // ── Permission Denied UI ───────────────────────────────────
  function _showPermissionDeniedUI() {
    // Don't show multiple times
    if (document.getElementById('location-permission-banner')) return;

    const banner = document.createElement('div');
    banner.id = 'location-permission-banner';
    banner.className = 'location-permission-banner';
    banner.innerHTML = `
      <div class="location-permission-banner__inner">
        <div class="location-permission-banner__icon">📍</div>
        <div class="location-permission-banner__content">
          <h4>Location Permission Required</h4>
          <p>Shramik Setu needs your location to show you on the live map. 
             Please allow location access in your browser settings.</p>
        </div>
        <button class="location-permission-banner__retry" id="location-retry-btn">
          🔄 Retry Permission
        </button>
        <button class="location-permission-banner__close" id="location-dismiss-btn">
          ✕
        </button>
      </div>
    `;

    // Insert at the top of the app
    const appEl = document.getElementById('app');
    if (appEl) {
      appEl.insertBefore(banner, appEl.firstChild);
    } else {
      document.body.appendChild(banner);
    }

    // Retry button handler
    document.getElementById('location-retry-btn')?.addEventListener('click', () => {
      _removePermissionUI();
      _startWatching();
    });

    // Dismiss button handler  
    document.getElementById('location-dismiss-btn')?.addEventListener('click', () => {
      _removePermissionUI();
    });
  }

  function _removePermissionUI() {
    const banner = document.getElementById('location-permission-banner');
    if (banner) {
      banner.classList.add('location-permission-banner--hiding');
      setTimeout(() => banner.remove(), 300);
    }
  }

  // ── Start GPS Watching ─────────────────────────────────────
  function _startWatching() {
    if (!navigator.geolocation) {
      console.error('[LocationService] ❌ Geolocation API not supported');
      if (_onError) _onError('not_supported', 'Geolocation not supported by this browser');
      return;
    }

    // Clear existing watch
    if (_watchId !== null) {
      navigator.geolocation.clearWatch(_watchId);
      _watchId = null;
    }

    console.log('[LocationService] 🛰️ Starting GPS watchPosition...');

    _watchId = navigator.geolocation.watchPosition(
      _onPositionSuccess,
      _onPositionError,
      CONFIG.GEOLOCATION_OPTIONS
    );

    console.log('[LocationService] 🛰️ GPS watching started (watchId:', _watchId, ')');

    // Also immediately try getCurrentPosition for faster first fix
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        console.log('[LocationService] 🎯 Quick getCurrentPosition fix received');
        if (!_firstUpdateSent) {
          _onPositionSuccess(pos);
        }
      },
      (err) => {
        console.warn('[LocationService] getCurrentPosition fallback failed:', err.message);
      },
      { enableHighAccuracy: false, timeout: 5000, maximumAge: 60000 }
    );
  }

  // ── Periodic Forced Update ─────────────────────────────────
  // Even if position hasn't changed, force an update every 10 seconds
  // to keep last_updated fresh for online status detection
  function _startPeriodicUpdate() {
    if (_intervalId) clearInterval(_intervalId);

    _intervalId = setInterval(() => {
      if (_latestPosition && _userId) {
        console.log('[LocationService] ⏰ Periodic forced update...');
        _upsertLocation(_latestPosition, true);
      }
    }, CONFIG.UPDATE_INTERVAL_MS);
  }

  // ── Set User Offline ───────────────────────────────────────
  async function _setOffline() {
    if (!_supabase || !_userId) return;

    try {
      const { error } = await _supabase
        .from('user_locations')
        .update({ online_status: false, last_updated: new Date().toISOString() })
        .eq('user_id', _userId);

      if (error) {
        console.warn('[LocationService] Error setting offline:', error.message);
      } else {
        console.log('[LocationService] 🔴 User set to offline');
      }
    } catch (err) {
      console.error('[LocationService] Error setting offline:', err);
    }
  }

  // ── Handle Page Visibility Change ──────────────────────────
  function _handleVisibilityChange() {
    if (document.visibilityState === 'hidden') {
      // Page is being hidden/closed — set offline  
      if (_supabase && _userId) {
        _setOffline();
      }
    } else if (document.visibilityState === 'visible') {
      // Page is visible again — resume tracking
      if (_userId && _latestPosition) {
        console.log('[LocationService] 👁️ Page visible again, sending location update...');
        _upsertLocation(_latestPosition, true);
      }
      // Restart watching in case it was suspended
      if (_userId && _isInitialized) {
        _startWatching();
      }
    }
  }

  // ── Handle Online/Offline Network Events ───────────────────
  function _handleOnline() {
    console.log('[LocationService] 🟢 Network back online');
    if (_latestPosition) {
      _upsertLocation(_latestPosition, true);
    }
  }

  function _handleOffline() {
    console.log('[LocationService] 🔴 Network went offline');
  }

  // ── Public API ─────────────────────────────────────────────

  /**
   * Initialize the location service after successful login
   * @param {Object} options
   * @param {Object} options.supabase - Supabase client instance
   * @param {string} options.userId - Current user's UUID
   * @param {string} options.userRole - 'worker' | 'customer' | 'admin'
   * @param {string} [options.userName] - User's display name
   * @param {Function} [options.onPermissionDenied] - Callback when GPS permission denied
   * @param {Function} [options.onPermissionGranted] - Callback when GPS permission granted
   * @param {Function} [options.onLocationUpdate] - Callback with each location update
   * @param {Function} [options.onError] - Callback for errors (type, message)
   */
  function init(options) {
    if (_isInitialized) {
      console.warn('[LocationService] Already initialized, stopping previous session...');
      stop();
    }

    if (!options.supabase) {
      console.error('[LocationService] ❌ Cannot init: Supabase client is null');
      return;
    }

    if (!options.userId) {
      console.error('[LocationService] ❌ Cannot init: userId is null/undefined');
      return;
    }

    _supabase = options.supabase;
    _userId = options.userId;
    _userRole = options.userRole || 'customer';
    _userName = options.userName || 'Unknown';
    _onPermissionDenied = options.onPermissionDenied || null;
    _onPermissionGranted = options.onPermissionGranted || null;
    _onLocationUpdate = options.onLocationUpdate || null;
    _onError = options.onError || null;

    // Reset state
    _lastSentLocation = null;
    _lastSentTime = 0;
    _latestPosition = null;
    _permissionDenied = false;
    _firstUpdateSent = false;
    _retryCount = 0;

    console.log('═══════════════════════════════════════════');
    console.log('[LocationService] ✅ INITIALIZING');
    console.log('[LocationService] User ID:', _userId);
    console.log('[LocationService] Role:', _userRole);
    console.log('[LocationService] Name:', _userName);
    console.log('[LocationService] Supabase URL:', _supabase.supabaseUrl || 'connected');
    console.log('[LocationService] Geolocation API:', navigator.geolocation ? 'SUPPORTED' : 'NOT SUPPORTED');
    console.log('[LocationService] Protocol:', window.location.protocol);
    console.log('[LocationService] Secure context:', window.isSecureContext ? 'YES' : 'NO');
    console.log('═══════════════════════════════════════════');

    // Check if HTTPS or localhost (required for geolocation)
    if (!window.isSecureContext && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
      console.warn('[LocationService] ⚠️ Not a secure context (HTTPS required for geolocation). Location may not work.');
    }

    // Start GPS watching
    _startWatching();

    // Start periodic forced updates
    _startPeriodicUpdate();

    // Listen for page visibility changes
    document.addEventListener('visibilitychange', _handleVisibilityChange);

    // Listen for network status changes
    window.addEventListener('online', _handleOnline);
    window.addEventListener('offline', _handleOffline);

    // Set offline on page unload
    window.addEventListener('beforeunload', _setOffline);

    _isInitialized = true;
  }

  /**
   * Stop tracking and clean up
   */
  function stop() {
    console.log('[LocationService] 🛑 Stopping...');

    // Stop GPS watching
    if (_watchId !== null) {
      navigator.geolocation.clearWatch(_watchId);
      _watchId = null;
    }

    // Stop periodic updates
    if (_intervalId) {
      clearInterval(_intervalId);
      _intervalId = null;
    }

    // Set user offline in database
    _setOffline();

    // Remove event listeners
    document.removeEventListener('visibilitychange', _handleVisibilityChange);
    window.removeEventListener('online', _handleOnline);
    window.removeEventListener('offline', _handleOffline);
    window.removeEventListener('beforeunload', _setOffline);

    // Remove permission UI
    _removePermissionUI();

    // Reset state
    _userId = null;
    _userRole = null;
    _userName = null;
    _latestPosition = null;
    _lastSentLocation = null;
    _lastSentTime = 0;
    _isInitialized = false;
    _firstUpdateSent = false;
    _retryCount = 0;

    console.log('[LocationService] 🛑 Stopped and cleaned up');
  }

  /**
   * Check if service is currently tracking
   */
  function isTracking() {
    return _isInitialized && _watchId !== null;
  }

  /**
   * Get last known position
   */
  function getLastPosition() {
    if (!_latestPosition) return null;
    return {
      latitude: _latestPosition.coords.latitude,
      longitude: _latestPosition.coords.longitude,
      accuracy: _latestPosition.coords.accuracy,
      heading: _latestPosition.coords.heading,
      speed: _latestPosition.coords.speed,
    };
  }

  /**
   * Force an immediate location update to the database
   */
  async function forceUpdate() {
    if (_latestPosition) {
      _lastSentTime = 0; // Reset throttle
      await _upsertLocation(_latestPosition, true);
    }
  }

  return {
    init,
    stop,
    isTracking,
    getLastPosition,
    forceUpdate,
    CONFIG, // Expose config for debugging
  };
})();
