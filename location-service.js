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
      timeout: 10000,
    },
  };

  // ── Internal State ─────────────────────────────────────────
  let _watchId = null;
  let _userId = null;
  let _userRole = null;
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

  // ── Upsert Location to Supabase ────────────────────────────
  // Uses ON CONFLICT (user_id) DO UPDATE to ensure single row per user
  async function _upsertLocation(position) {
    if (!_supabase || !_userId) return;

    const now = Date.now();
    const locationChanged = _hasLocationChanged(position);
    const timeElapsed = now - _lastSentTime >= CONFIG.UPDATE_INTERVAL_MS;

    // Only send if location changed OR time threshold passed
    if (!locationChanged && !timeElapsed) return;

    const payload = {
      user_id: _userId,
      role: _userRole || 'customer',
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      accuracy: position.coords.accuracy || null,
      heading: position.coords.heading || null,
      speed: position.coords.speed || null,
      online_status: true,
      last_updated: new Date().toISOString(),
    };

    try {
      const { error } = await _supabase
        .from('user_locations')
        .upsert(payload, { onConflict: 'user_id' });

      if (error) {
        console.error('[LocationService] Upsert error:', error.message);
        if (_onError) _onError('database', error.message);
        return;
      }

      // Update tracking state
      _lastSentLocation = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      };
      _lastSentTime = now;

      console.log(
        `[LocationService] 📍 Location saved: ${position.coords.latitude.toFixed(5)}, ${position.coords.longitude.toFixed(5)}`
      );

      if (_onLocationUpdate) {
        _onLocationUpdate({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
          heading: position.coords.heading,
          speed: position.coords.speed,
        });
      }
    } catch (err) {
      console.error('[LocationService] Network error:', err);
      if (_onError) _onError('network', err.message);
    }
  }

  // ── watchPosition Success Callback ─────────────────────────
  function _onPositionSuccess(position) {
    _latestPosition = position;
    _permissionDenied = false;

    // Remove permission denied UI if it exists
    _removePermissionUI();

    _upsertLocation(position);
  }

  // ── watchPosition Error Callback ───────────────────────────
  function _onPositionError(error) {
    console.warn('[LocationService] GPS Error:', error.message, '(code:', error.code, ')');

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
          if (_watchId !== null) {
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
      console.error('[LocationService] Geolocation API not supported');
      if (_onError) _onError('not_supported', 'Geolocation not supported by this browser');
      return;
    }

    // Clear existing watch
    if (_watchId !== null) {
      navigator.geolocation.clearWatch(_watchId);
    }

    _watchId = navigator.geolocation.watchPosition(
      _onPositionSuccess,
      _onPositionError,
      CONFIG.GEOLOCATION_OPTIONS
    );

    console.log('[LocationService] 🛰️ GPS watching started (watchId:', _watchId, ')');
  }

  // ── Periodic Forced Update ─────────────────────────────────
  // Even if position hasn't changed, force an update every 10 seconds
  // to keep last_updated fresh for online status detection
  function _startPeriodicUpdate() {
    if (_intervalId) clearInterval(_intervalId);

    _intervalId = setInterval(() => {
      if (_latestPosition && _userId) {
        _upsertLocation(_latestPosition);
      }
    }, CONFIG.UPDATE_INTERVAL_MS);
  }

  // ── Set User Offline ───────────────────────────────────────
  async function _setOffline() {
    if (!_supabase || !_userId) return;

    try {
      await _supabase
        .from('user_locations')
        .update({ online_status: false, last_updated: new Date().toISOString() })
        .eq('user_id', _userId);

      console.log('[LocationService] 🔴 User set to offline');
    } catch (err) {
      console.error('[LocationService] Error setting offline:', err);
    }
  }

  // ── Handle Page Visibility Change ──────────────────────────
  function _handleVisibilityChange() {
    if (document.visibilityState === 'hidden') {
      // Page is being hidden/closed — set offline  
      // Use sendBeacon for reliable delivery
      if (_supabase && _userId) {
        _setOffline();
      }
    } else if (document.visibilityState === 'visible') {
      // Page is visible again — resume tracking
      if (_userId && _latestPosition) {
        _upsertLocation(_latestPosition);
      }
    }
  }

  // ── Handle Online/Offline Network Events ───────────────────
  function _handleOnline() {
    console.log('[LocationService] 🟢 Network back online');
    if (_latestPosition) {
      _upsertLocation(_latestPosition);
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

    _supabase = options.supabase;
    _userId = options.userId;
    _userRole = options.userRole || 'customer';
    _onPermissionDenied = options.onPermissionDenied || null;
    _onPermissionGranted = options.onPermissionGranted || null;
    _onLocationUpdate = options.onLocationUpdate || null;
    _onError = options.onError || null;

    // Reset state
    _lastSentLocation = null;
    _lastSentTime = 0;
    _latestPosition = null;
    _permissionDenied = false;

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
    console.log('[LocationService] ✅ Initialized for user:', _userId, 'role:', _userRole);
  }

  /**
   * Stop tracking and clean up
   */
  function stop() {
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
    _latestPosition = null;
    _lastSentLocation = null;
    _lastSentTime = 0;
    _isInitialized = false;

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
      await _upsertLocation(_latestPosition);
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
