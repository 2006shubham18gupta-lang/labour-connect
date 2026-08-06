/**
 * ============================================================
 * SHRAMIK SETU — ADMIN LIVE MAP MODULE
 * Real-time GPS tracking dashboard with Leaflet + OpenStreetMap
 * ============================================================
 * 
 * Features:
 * - Full-screen Leaflet map with OpenStreetMap tiles
 * - Color-coded markers (Blue=Customer, Orange=Worker, Gray=Offline)
 * - Supabase Realtime subscription for instant updates
 * - Search by name, phone, user ID, role
 * - Filter by role (Customer/Worker) and status (Online/Offline)
 * - Click marker for detailed user info popup
 * - Auto-refresh without manual polling
 * - Proper cleanup of subscriptions
 */

const LiveMap = (function () {
  'use strict';

  // ── Internal State ─────────────────────────────────────────
  let _map = null;
  let _supabase = null;
  let _markers = {};          // userId -> L.marker
  let _locationData = {};     // userId -> location data
  let _userData = {};         // userId -> user data (name, phone, role)
  let _realtimeChannel = null;
  let _offlineCheckInterval = null;
  let _isInitialized = false;
  let _activeFilters = {
    role: 'all',       // 'all' | 'customer' | 'worker'
    status: 'all',     // 'all' | 'online' | 'offline'
    searchQuery: '',
  };

  // ── Configuration ──────────────────────────────────────────
  const OFFLINE_THRESHOLD_MS = 2 * 60 * 1000; // 2 minutes
  const OFFLINE_CHECK_INTERVAL = 30000; // Check every 30 seconds
  const DEFAULT_CENTER = [20.5937, 78.9629]; // India center
  const DEFAULT_ZOOM = 5;

  // ── Marker Icons ───────────────────────────────────────────
  function _createMarkerIcon(role, isOnline) {
    if (!isOnline) {
      // Gray offline marker
      return L.divIcon({
        className: 'live-map-marker live-map-marker--offline',
        html: `
          <div class="live-map-marker__dot live-map-marker__dot--gray">
            <span class="live-map-marker__emoji">⚫</span>
          </div>
        `,
        iconSize: [36, 36],
        iconAnchor: [18, 18],
        popupAnchor: [0, -20],
      });
    }

    if (role === 'customer') {
      // Blue customer marker
      return L.divIcon({
        className: 'live-map-marker live-map-marker--customer',
        html: `
          <div class="live-map-marker__dot live-map-marker__dot--blue">
            <span class="live-map-marker__emoji">🏠</span>
          </div>
          <div class="live-map-marker__pulse live-map-marker__pulse--blue"></div>
        `,
        iconSize: [40, 40],
        iconAnchor: [20, 20],
        popupAnchor: [0, -22],
      });
    }

    // Orange worker/labour marker
    return L.divIcon({
      className: 'live-map-marker live-map-marker--worker',
      html: `
        <div class="live-map-marker__dot live-map-marker__dot--orange">
          <span class="live-map-marker__emoji">👷</span>
        </div>
        <div class="live-map-marker__pulse live-map-marker__pulse--orange"></div>
      `,
      iconSize: [40, 40],
      iconAnchor: [20, 20],
      popupAnchor: [0, -22],
    });
  }

  // ── Build Popup Content ────────────────────────────────────
  function _buildPopupContent(userId) {
    const loc = _locationData[userId];
    const user = _userData[userId];
    if (!loc) return '';

    const name = user?.full_name || 'Unknown User';
    const phone = user?.phone || 'N/A';
    const role = (loc.role || user?.role || 'unknown').toUpperCase();
    const isOnline = _isUserOnline(loc);
    const statusText = isOnline ? '🟢 Online' : '🔴 Offline';
    const statusClass = isOnline ? 'popup-status--online' : 'popup-status--offline';
    const lastUpdated = loc.last_updated
      ? new Date(loc.last_updated).toLocaleString('en-IN', { 
          dateStyle: 'short', 
          timeStyle: 'medium' 
        })
      : 'Unknown';
    const accuracy = loc.accuracy ? `${loc.accuracy.toFixed(1)}m` : 'N/A';
    const speed = loc.speed ? `${(loc.speed * 3.6).toFixed(1)} km/h` : 'Stationary';
    const heading = loc.heading ? `${loc.heading.toFixed(0)}°` : 'N/A';

    return `
      <div class="live-map-popup">
        <div class="live-map-popup__header">
          <strong class="live-map-popup__name">${name}</strong>
          <span class="live-map-popup__status ${statusClass}">${statusText}</span>
        </div>
        <div class="live-map-popup__grid">
          <div class="live-map-popup__row">
            <span class="live-map-popup__label">📱 Phone</span>
            <span class="live-map-popup__value">${phone}</span>
          </div>
          <div class="live-map-popup__row">
            <span class="live-map-popup__label">🏷️ Role</span>
            <span class="live-map-popup__value live-map-popup__role">${role}</span>
          </div>
          <div class="live-map-popup__row">
            <span class="live-map-popup__label">📍 Latitude</span>
            <span class="live-map-popup__value">${loc.latitude.toFixed(6)}</span>
          </div>
          <div class="live-map-popup__row">
            <span class="live-map-popup__label">📍 Longitude</span>
            <span class="live-map-popup__value">${loc.longitude.toFixed(6)}</span>
          </div>
          <div class="live-map-popup__row">
            <span class="live-map-popup__label">🎯 Accuracy</span>
            <span class="live-map-popup__value">${accuracy}</span>
          </div>
          <div class="live-map-popup__row">
            <span class="live-map-popup__label">🏃 Speed</span>
            <span class="live-map-popup__value">${speed}</span>
          </div>
          <div class="live-map-popup__row">
            <span class="live-map-popup__label">🧭 Heading</span>
            <span class="live-map-popup__value">${heading}</span>
          </div>
          <div class="live-map-popup__row">
            <span class="live-map-popup__label">🕐 Last Updated</span>
            <span class="live-map-popup__value">${lastUpdated}</span>
          </div>
        </div>
        <div class="live-map-popup__actions">
          <a href="https://www.google.com/maps?q=${loc.latitude},${loc.longitude}" 
             target="_blank" class="live-map-popup__btn live-map-popup__btn--maps">
            🗺️ Google Maps
          </a>
          <a href="https://www.google.com/maps/dir/?api=1&destination=${loc.latitude},${loc.longitude}" 
             target="_blank" class="live-map-popup__btn live-map-popup__btn--directions">
            🧭 Directions
          </a>
        </div>
      </div>
    `;
  }

  // ── Check if User is Online ────────────────────────────────
  function _isUserOnline(locationData) {
    if (!locationData.online_status) return false;
    if (!locationData.last_updated) return false;

    const lastUpdate = new Date(locationData.last_updated).getTime();
    const now = Date.now();
    return (now - lastUpdate) < OFFLINE_THRESHOLD_MS;
  }

  // ── Should Show Marker (Filter Check) ──────────────────────
  function _shouldShowMarker(userId) {
    const loc = _locationData[userId];
    const user = _userData[userId];
    if (!loc) return false;

    const isOnline = _isUserOnline(loc);
    const role = (loc.role || user?.role || '').toLowerCase();
    const name = (user?.full_name || '').toLowerCase();
    const phone = (user?.phone || '').toLowerCase();

    // Role filter
    if (_activeFilters.role !== 'all') {
      const filterRole = _activeFilters.role;
      if (filterRole === 'worker' && role !== 'worker' && role !== 'labour') return false;
      if (filterRole === 'customer' && role !== 'customer') return false;
    }

    // Status filter
    if (_activeFilters.status === 'online' && !isOnline) return false;
    if (_activeFilters.status === 'offline' && isOnline) return false;

    // Search filter
    if (_activeFilters.searchQuery) {
      const q = _activeFilters.searchQuery.toLowerCase();
      const matchesName = name.includes(q);
      const matchesPhone = phone.includes(q);
      const matchesId = userId.toLowerCase().includes(q);
      const matchesRole = role.includes(q);
      const matchesStatus = (isOnline ? 'online' : 'offline').includes(q);
      if (!matchesName && !matchesPhone && !matchesId && !matchesRole && !matchesStatus) {
        return false;
      }
    }

    return true;
  }

  // ── Add or Update a Marker ─────────────────────────────────
  function _addOrUpdateMarker(userId) {
    const loc = _locationData[userId];
    if (!loc || !loc.latitude || !loc.longitude) return;

    const user = _userData[userId];
    const isOnline = _isUserOnline(loc);
    const role = (loc.role || user?.role || 'customer').toLowerCase();
    const shouldShow = _shouldShowMarker(userId);

    // Remove existing marker if not filtered in
    if (!shouldShow) {
      if (_markers[userId]) {
        _map.removeLayer(_markers[userId]);
        delete _markers[userId];
      }
      return;
    }

    const icon = _createMarkerIcon(role, isOnline);
    const popupContent = _buildPopupContent(userId);

    if (_markers[userId]) {
      // Update existing marker position and icon
      _markers[userId].setLatLng([loc.latitude, loc.longitude]);
      _markers[userId].setIcon(icon);
      _markers[userId].setPopupContent(popupContent);
    } else {
      // Create new marker
      const marker = L.marker([loc.latitude, loc.longitude], { icon })
        .addTo(_map)
        .bindPopup(popupContent, {
          maxWidth: 320,
          className: 'live-map-popup-wrapper',
        });

      _markers[userId] = marker;
    }
  }

  // ── Refresh All Markers ────────────────────────────────────
  function _refreshAllMarkers() {
    Object.keys(_locationData).forEach(userId => {
      _addOrUpdateMarker(userId);
    });
    _updateStatsUI();
  }

  // ── Update Stats UI ────────────────────────────────────────
  function _updateStatsUI() {
    const totalTracked = Object.keys(_locationData).length;
    let onlineCount = 0;
    let offlineCount = 0;
    let customerCount = 0;
    let workerCount = 0;

    Object.values(_locationData).forEach(loc => {
      const isOnline = _isUserOnline(loc);
      if (isOnline) onlineCount++;
      else offlineCount++;

      const role = (loc.role || '').toLowerCase();
      if (role === 'customer') customerCount++;
      else if (role === 'worker' || role === 'labour') workerCount++;
    });

    const els = {
      total: document.getElementById('livemap-stat-total'),
      online: document.getElementById('livemap-stat-online'),
      offline: document.getElementById('livemap-stat-offline'),
      customers: document.getElementById('livemap-stat-customers'),
      workers: document.getElementById('livemap-stat-workers'),
    };

    if (els.total) els.total.textContent = totalTracked;
    if (els.online) els.online.textContent = onlineCount;
    if (els.offline) els.offline.textContent = offlineCount;
    if (els.customers) els.customers.textContent = customerCount;
    if (els.workers) els.workers.textContent = workerCount;
  }

  // ── Fetch Initial Data ─────────────────────────────────────
  async function _fetchInitialData() {
    if (!_supabase) return;

    try {
      // Fetch all locations
      const { data: locations, error: locError } = await _supabase
        .from('user_locations')
        .select('*');

      if (locError) {
        console.error('[LiveMap] Fetch locations error:', locError.message);
        return;
      }

      // Fetch all users for name/phone data
      const { data: users, error: usrError } = await _supabase
        .from('users')
        .select('id, full_name, phone, role, email');

      if (usrError) {
        console.error('[LiveMap] Fetch users error:', usrError.message);
      }

      // Index user data
      if (users) {
        users.forEach(u => {
          _userData[u.id] = u;
        });
      }

      // Index location data and create markers
      if (locations) {
        locations.forEach(loc => {
          _locationData[loc.user_id] = loc;
        });
      }

      // Render all markers
      _refreshAllMarkers();

      // Fit map bounds to markers if any exist
      const validMarkers = Object.values(_markers);
      if (validMarkers.length > 0) {
        const group = L.featureGroup(validMarkers);
        _map.fitBounds(group.getBounds().pad(0.1));
      }

      console.log(`[LiveMap] ✅ Loaded ${locations?.length || 0} locations, ${users?.length || 0} users`);
    } catch (err) {
      console.error('[LiveMap] Fetch error:', err);
    }
  }

  // ── Subscribe to Realtime Updates ──────────────────────────
  function _subscribeRealtime() {
    if (!_supabase) return;

    // Unsubscribe existing channel
    if (_realtimeChannel) {
      _supabase.removeChannel(_realtimeChannel);
      _realtimeChannel = null;
    }

    _realtimeChannel = _supabase
      .channel('user_locations_realtime')
      .on(
        'postgres_changes',
        {
          event: '*', // Listen for INSERT, UPDATE, DELETE
          schema: 'public',
          table: 'user_locations',
        },
        (payload) => {
          console.log('[LiveMap] 🔔 Realtime event:', payload.eventType);

          if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
            const loc = payload.new;
            _locationData[loc.user_id] = loc;
            _addOrUpdateMarker(loc.user_id);
            _updateStatsUI();
          } else if (payload.eventType === 'DELETE') {
            const userId = payload.old?.user_id;
            if (userId) {
              delete _locationData[userId];
              if (_markers[userId]) {
                _map.removeLayer(_markers[userId]);
                delete _markers[userId];
              }
              _updateStatsUI();
            }
          }
        }
      )
      .subscribe((status) => {
        console.log('[LiveMap] Realtime subscription status:', status);
      });
  }

  // ── Periodic Offline Check ─────────────────────────────────
  // Checks all users and updates markers for those who went offline
  function _startOfflineCheck() {
    if (_offlineCheckInterval) clearInterval(_offlineCheckInterval);

    _offlineCheckInterval = setInterval(() => {
      let changed = false;
      Object.keys(_locationData).forEach(userId => {
        const loc = _locationData[userId];
        const wasOnline = _isUserOnline({ ...loc, last_updated: loc._lastCheckedOnline });
        const isNowOnline = _isUserOnline(loc);

        if (wasOnline !== undefined && wasOnline !== isNowOnline) {
          changed = true;
        }

        // Update marker icon if user went offline
        _addOrUpdateMarker(userId);
      });

      if (changed) {
        _updateStatsUI();
      }
    }, OFFLINE_CHECK_INTERVAL);
  }

  // ── Initialize Event Listeners for Search/Filters ──────────
  function _setupFilterListeners() {
    const searchInput = document.getElementById('livemap-search');
    const roleFilter = document.getElementById('livemap-role-filter');
    const statusFilter = document.getElementById('livemap-status-filter');

    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        _activeFilters.searchQuery = e.target.value.trim();
        _refreshAllMarkers();
      });
    }

    if (roleFilter) {
      roleFilter.addEventListener('change', (e) => {
        _activeFilters.role = e.target.value;
        _refreshAllMarkers();
      });
    }

    if (statusFilter) {
      statusFilter.addEventListener('change', (e) => {
        _activeFilters.status = e.target.value;
        _refreshAllMarkers();
      });
    }
  }

  // ── Public API ─────────────────────────────────────────────

  /**
   * Initialize the live map
   * @param {Object} options
   * @param {Object} options.supabase - Supabase client instance
   * @param {string} options.containerId - DOM element ID for the map
   */
  async function init(options) {
    if (_isInitialized) {
      console.warn('[LiveMap] Already initialized, destroying first...');
      destroy();
    }

    _supabase = options.supabase;
    const containerId = options.containerId || 'admin-live-map';

    // Wait for container to be visible
    const container = document.getElementById(containerId);
    if (!container) {
      console.error('[LiveMap] Map container not found:', containerId);
      return;
    }

    // Define strict India LatLng bounds
    const INDIA_BOUNDS = L.latLngBounds(
      [6.5, 68.0],
      [35.5, 97.5]
    );

    // Initialize Leaflet map locked to India
    _map = L.map(containerId, {
      center: [22.5937, 78.9629],
      zoom: 5,
      minZoom: 4.5,
      maxZoom: 18,
      maxBounds: INDIA_BOUNDS,
      maxBoundsViscosity: 1.0,
      zoomControl: true,
      attributionControl: true,
    });

    // Fit view to India by default
    _map.fitBounds(INDIA_BOUNDS);

    // Add OpenStreetMap tile layer with dark theme
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      attribution: '© OpenStreetMap contributors © CARTO',
      maxZoom: 19,
      subdomains: 'abcd',
    }).addTo(_map);

    // Setup filter listeners
    _setupFilterListeners();

    // Fetch initial data
    await _fetchInitialData();

    // Subscribe to realtime updates
    _subscribeRealtime();

    // Start offline checking
    _startOfflineCheck();

    _isInitialized = true;
    console.log('[LiveMap] ✅ Live map initialized');
  }

  /**
   * Destroy the map and clean up all resources
   */
  function destroy() {
    // Unsubscribe realtime
    if (_realtimeChannel && _supabase) {
      _supabase.removeChannel(_realtimeChannel);
      _realtimeChannel = null;
    }

    // Stop offline check
    if (_offlineCheckInterval) {
      clearInterval(_offlineCheckInterval);
      _offlineCheckInterval = null;
    }

    // Remove all markers
    Object.values(_markers).forEach(marker => {
      if (_map) _map.removeLayer(marker);
    });
    _markers = {};

    // Destroy map
    if (_map) {
      _map.remove();
      _map = null;
    }

    // Reset state
    _locationData = {};
    _userData = {};
    _activeFilters = { role: 'all', status: 'all', searchQuery: '' };
    _isInitialized = false;

    console.log('[LiveMap] 🗑️ Destroyed and cleaned up');
  }

  /**
   * Force refresh all data from database
   */
  async function refresh() {
    if (!_isInitialized) return;

    // Clear existing markers
    Object.values(_markers).forEach(marker => {
      if (_map) _map.removeLayer(marker);
    });
    _markers = {};
    _locationData = {};

    await _fetchInitialData();
    console.log('[LiveMap] 🔄 Data refreshed');
  }

  /**
   * Invalidate map size (call when container becomes visible)
   */
  function invalidateSize() {
    if (_map) {
      setTimeout(() => _map.invalidateSize(), 100);
    }
  }

  return {
    init,
    destroy,
    refresh,
    invalidateSize,
  };
})();
