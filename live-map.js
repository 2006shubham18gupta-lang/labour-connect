/**
 * ============================================================
 * SHRAMIK SETU — PROFESSIONAL ADMIN LIVE MAP MODULE
 * Enterprise-Grade Geolocation Operations Dashboard (Leaflet + OSM)
 * ============================================================
 * 
 * Features:
 * - Dark enterprise CartoDB tiles with high contrast labels
 * - Distinct Markers: Customer (Blue), Worker (Orange), Admin (Purple), Offline (Gray)
 * - Auto Zoom & Auto-Centering logic (Single user -> Center, Multiple -> Fit Bounds)
 * - Realtime Supabase integration + fallback polling (15s)
 * - Professional Popup Card with Profile Photo (if available), Name, Role, Phone, Status, Coordinates & Accuracy
 * - Filtering by Role (Customer, Worker, Admin) and Status (Online, Offline)
 * - Smooth marker movement animation (1s ease-out)
 */

const LiveMap = (function () {
  'use strict';

  // ── Internal State ─────────────────────────────────────────
  let _map = null;
  let _supabase = null;
  let _markers = {};          // userId -> L.marker
  let _locationData = {};     // userId -> location data row
  let _userData = {};         // userId -> user & profile metadata
  let _clusterGroup = null;   // MarkerClusterGroup for anti-overlap
  let _realtimeChannel = null;
  let _offlineCheckInterval = null;
  let _pollInterval = null;
  let _isInitialized = false;
  let _hasAppliedInitialZoom = false;

  let _activeFilters = {
    role: 'all',       // 'all' | 'customer' | 'worker' | 'admin'
    status: 'all',     // 'all' | 'online' | 'offline'
    searchQuery: '',
  };

  // ── Configuration ──────────────────────────────────────────
  const OFFLINE_THRESHOLD_MS = 2 * 60 * 1000; // 2 minutes
  const OFFLINE_CHECK_INTERVAL = 30000;       // Check every 30 seconds
  const POLL_INTERVAL = 15000;                // Fallback poll every 15 seconds
  const SMOOTH_MOVE_DURATION = 1000;          // Smooth move duration in ms

  // Strict India Bounds for Map Lock
  const INDIA_BOUNDS = L.latLngBounds(
    [6.5, 68.0],
    [35.5, 97.5]
  );

  // ── Role Color Helper ──────────────────────────────────────
  function _getRoleDetails(role, isOnline) {
    if (!isOnline) {
      return {
        key: 'offline',
        label: 'OFFLINE',
        color: '#64748b',
        bg: 'rgba(100, 116, 139, 0.16)',
        border: 'rgba(100, 116, 139, 0.35)',
        badgeClass: 'popup-status--offline',
      };
    }

    const r = (role || '').toLowerCase();
    if (r === 'admin') {
      return {
        key: 'admin',
        label: 'ADMIN',
        color: '#a855f7',
        bg: 'rgba(168, 85, 247, 0.16)',
        border: 'rgba(168, 85, 247, 0.35)',
        badgeClass: 'popup-status--admin',
      };
    }
    if (r === 'worker' || r === 'labour') {
      return {
        key: 'worker',
        label: 'WORKER',
        color: '#f59e0b',
        bg: 'rgba(245, 158, 11, 0.16)',
        border: 'rgba(245, 158, 11, 0.35)',
        badgeClass: 'popup-status--worker',
      };
    }
    // Default: customer
    return {
      key: 'customer',
      label: 'CUSTOMER',
      color: '#3b82f6',
      bg: 'rgba(59, 130, 246, 0.16)',
      border: 'rgba(59, 130, 246, 0.35)',
      badgeClass: 'popup-status--customer',
    };
  }

  // ── Marker Icon Generator ──────────────────────────────────
  // Compact pin with precise anchor at exact lat/lng
  function _createMarkerIcon(role, isOnline, userObj) {
    const roleInfo = _getRoleDetails(role, isOnline);
    const photo = userObj?.photo || '';
    const name = userObj?.full_name || userObj?.name || 'User';
    const initials = name.replace(/\(.*?\)/g, '').trim().split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase() || 'U';

    const iconSymbol = roleInfo.key === 'admin' ? '⚡'
                     : roleInfo.key === 'worker' ? '👷'
                     : roleInfo.key === 'customer' ? '🏠' : '⚫';

    const avatarInner = photo
      ? `<img src="${photo}" alt="${name}" class="map-marker-pin__img" />`
      : `<span class="map-marker-pin__initials">${initials || iconSymbol}</span>`;

    // Compact pin: circle avatar + pointer tip at exact bottom
    // Total height: tag(24) + gap(4) + pin(42) + pointer(8) = 78px
    // Total width: max(tag, pin) = ~160px for tag, pin is centered
    const pinHtml = `
      <div class="map-marker-card map-marker-card--${roleInfo.key} ${isOnline ? 'is-online' : 'is-offline'}">
        <div class="map-marker-card__tag">
          <span class="map-marker-card__status-dot ${isOnline ? 'online' : 'offline'}"></span>
          <span class="map-marker-card__name">${name}</span>
          <span class="map-marker-card__role-pill map-marker-card__role-pill--${roleInfo.key}">${roleInfo.label}</span>
        </div>
        <div class="map-marker-pin map-marker-pin--${roleInfo.key}">
          <div class="map-marker-pin__avatar">
            ${avatarInner}
          </div>
          ${isOnline ? `<div class="map-marker-pin__pulse-ring"></div><div class="map-marker-pin__pulse-ring map-marker-pin__pulse-ring--delayed"></div>` : ''}
          <div class="map-marker-pin__pointer map-marker-pin__pointer--${roleInfo.key}"></div>
        </div>
      </div>
    `;

    // iconSize: width=160 to fit tag, height=78 for full pin structure
    // iconAnchor: center-x=80, bottom-y=78 (pointer tip touches exact coordinate)
    return L.divIcon({
      className: `map-marker-wrapper map-marker-wrapper--${roleInfo.key}`,
      html: pinHtml,
      iconSize: [160, 78],
      iconAnchor: [80, 78],
      popupAnchor: [0, -78],
    });
  }

  // ── Check if Location Record is Active/Online ──────────────
  function _isUserOnline(locationData) {
    if (!locationData) return false;
    if (locationData.online_status === false) return false;
    if (!locationData.last_updated) return false;

    const lastUpdate = new Date(locationData.last_updated).getTime();
    const now = Date.now();
    return (now - lastUpdate) < OFFLINE_THRESHOLD_MS;
  }

  // ── Popup Content Renderer ─────────────────────────────────
  // Shows only fields with real data; hides unavailable fields
  function _buildPopupContent(userId) {
    const loc = _locationData[userId];
    const user = _userData[userId] || {};
    if (!loc) return '';

    const name = user.full_name || user.name || 'Anonymous User';
    const phone = user.phone || '';
    const email = user.email || '';
    const photo = user.photo || '';
    const initials = name.replace(/\(.*?\)/g, '').trim().split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase() || 'U';

    const isOnline = _isUserOnline(loc);
    const roleInfo = _getRoleDetails(loc.role || user.role, isOnline);
    const statusLabel = isOnline ? '🟢 Online' : '🔴 Inactive (2m+)';

    const lastUpdatedFormatted = loc.last_updated
      ? new Date(loc.last_updated).toLocaleString('en-IN', {
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        })
      : '';

    const hasAccuracy = loc.accuracy !== undefined && loc.accuracy !== null;
    const accuracyText = hasAccuracy ? `${Math.round(loc.accuracy)} m` : '';

    const avatarHtml = photo
      ? `<img src="${photo}" alt="${name}" class="live-map-popup__avatar-img" />`
      : `<div class="live-map-popup__avatar-fallback">${initials}</div>`;

    // Build info rows — only include fields that have real data
    let infoRows = '';
    if (phone) {
      infoRows += `
          <div class="live-map-popup__info-row">
            <span class="live-map-popup__info-label">📞 Phone</span>
            <span class="live-map-popup__info-value">${phone}</span>
          </div>`;
    }
    if (email) {
      infoRows += `
          <div class="live-map-popup__info-row">
            <span class="live-map-popup__info-label">✉️ Email</span>
            <span class="live-map-popup__info-value">${email}</span>
          </div>`;
    }
    infoRows += `
          <div class="live-map-popup__info-row">
            <span class="live-map-popup__info-label">📍 Coordinates</span>
            <span class="live-map-popup__info-value live-map-popup__info-value--mono">
              ${loc.latitude.toFixed(6)}, ${loc.longitude.toFixed(6)}
            </span>
          </div>`;
    if (accuracyText) {
      infoRows += `
          <div class="live-map-popup__info-row">
            <span class="live-map-popup__info-label">🎯 Accuracy</span>
            <span class="live-map-popup__info-value">${accuracyText}</span>
          </div>`;
    }
    if (lastUpdatedFormatted) {
      infoRows += `
          <div class="live-map-popup__info-row">
            <span class="live-map-popup__info-label">🕐 Last Updated</span>
            <span class="live-map-popup__info-value">${lastUpdatedFormatted}</span>
          </div>`;
    }

    return `
      <div class="live-map-popup">
        <div class="live-map-popup__header">
          <div class="live-map-popup__avatar">
            ${avatarHtml}
          </div>
          <div class="live-map-popup__meta">
            <h4 class="live-map-popup__name">${name}</h4>
            <div class="live-map-popup__badges">
              <span class="live-map-popup__role-badge live-map-popup__role-badge--${roleInfo.key}">
                ${roleInfo.label}
              </span>
              <span class="live-map-popup__status-badge ${isOnline ? 'online' : 'offline'}">
                ${statusLabel}
              </span>
            </div>
          </div>
        </div>

        <div class="live-map-popup__body">
          ${infoRows}
        </div>

        <div class="live-map-popup__footer">
          <a href="https://www.google.com/maps?q=${loc.latitude},${loc.longitude}" 
             target="_blank" rel="noopener noreferrer" class="live-map-popup__action-btn live-map-popup__action-btn--maps">
            🗺️ Google Maps
          </a>
          <a href="https://www.google.com/maps/dir/?api=1&destination=${loc.latitude},${loc.longitude}" 
             target="_blank" rel="noopener noreferrer" class="live-map-popup__action-btn live-map-popup__action-btn--dir">
            🧭 Directions
          </a>
        </div>
      </div>
    `;
  }

  // ── Filter Check ───────────────────────────────────────────
  function _shouldShowMarker(userId) {
    const loc = _locationData[userId];
    const user = _userData[userId] || {};
    if (!loc || !loc.latitude || !loc.longitude) return false;

    const isOnline = _isUserOnline(loc);
    const role = (loc.role || user.role || '').toLowerCase();
    const name = (user.full_name || user.name || '').toLowerCase();
    const phone = (user.phone || '').toLowerCase();

    // Role filter
    if (_activeFilters.role !== 'all') {
      const filterRole = _activeFilters.role.toLowerCase();
      if (filterRole === 'worker' && role !== 'worker' && role !== 'labour') return false;
      if (filterRole === 'customer' && role !== 'customer') return false;
      if (filterRole === 'admin' && role !== 'admin') return false;
    }

    // Status filter
    if (_activeFilters.status === 'online' && !isOnline) return false;
    if (_activeFilters.status === 'offline' && isOnline) return false;

    // Search query filter
    if (_activeFilters.searchQuery) {
      const q = _activeFilters.searchQuery.toLowerCase();
      const matchName = name.includes(q);
      const matchPhone = phone.includes(q);
      const matchId = userId.toLowerCase().includes(q);
      const matchRole = role.includes(q);
      if (!matchName && !matchPhone && !matchId && !matchRole) return false;
    }

    return true;
  }

  // ── Smooth Position Animation ──────────────────────────────
  function _smoothMoveMarker(marker, targetLatLng, duration) {
    if (!marker || !marker.getLatLng) return;

    const start = marker.getLatLng();
    const targetLat = targetLatLng[0];
    const targetLng = targetLatLng[1];

    if (start.lat === targetLat && start.lng === targetLng) return;

    const startTime = performance.now();

    function animate(currentTime) {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      
      // Cubic ease-out curve
      const ease = 1 - Math.pow(1 - progress, 3);

      const currentLat = start.lat + (targetLat - start.lat) * ease;
      const currentLng = start.lng + (targetLng - start.lng) * ease;

      marker.setLatLng([currentLat, currentLng]);

      if (progress < 1) {
        requestAnimationFrame(animate);
      }
    }

    requestAnimationFrame(animate);
  }

  // ── Add or Update Marker ───────────────────────────────────
  function _addOrUpdateMarker(userId) {
    const loc = _locationData[userId];
    if (!loc || !loc.latitude || !loc.longitude) return;

    const user = _userData[userId] || {};
    const isOnline = _isUserOnline(loc);
    const role = loc.role || user.role || 'customer';
    const shouldShow = _shouldShowMarker(userId);

    // Filter out marker if hidden
    if (!shouldShow) {
      if (_markers[userId]) {
        if (_clusterGroup) _clusterGroup.removeLayer(_markers[userId]);
        else _map.removeLayer(_markers[userId]);
        delete _markers[userId];
      }
      return;
    }

    const icon = _createMarkerIcon(role, isOnline, user);
    const popupContent = _buildPopupContent(userId);

    if (_markers[userId]) {
      // Update existing marker smoothly without recreating DOM node
      _smoothMoveMarker(_markers[userId], [loc.latitude, loc.longitude], SMOOTH_MOVE_DURATION);
      _markers[userId].setIcon(icon);
      _markers[userId].setPopupContent(popupContent);
    } else {
      // Create new marker instance — add to cluster group (not map directly)
      const marker = L.marker([loc.latitude, loc.longitude], { icon })
        .bindPopup(popupContent, {
          maxWidth: 320,
          className: 'live-map-popup-wrapper',
        });

      if (_clusterGroup) {
        _clusterGroup.addLayer(marker);
      } else {
        marker.addTo(_map);
      }

      _markers[userId] = marker;
    }
  }

  // ── Auto Zoom & Fit Bounds ─────────────────────────────────
  function _applyAutoZoom() {
    if (!_map) return;

    const activeMarkers = Object.values(_markers);
    if (activeMarkers.length === 0) {
      _map.fitBounds(INDIA_BOUNDS);
      return;
    }

    if (activeMarkers.length === 1) {
      // Single online user -> smoothly fly to and center on that user
      const latLng = activeMarkers[0].getLatLng();
      _map.flyTo(latLng, 14, { animate: true, duration: 1.2 });
    } else {
      // Multiple users -> fit all markers in bounds with padding
      const group = L.featureGroup(activeMarkers);
      _map.fitBounds(group.getBounds().pad(0.18), { animate: true, duration: 1.2 });
    }
  }

  // ── Refresh All Markers & Stats ────────────────────────────
  function _refreshAllMarkers(shouldAutoZoom = false) {
    Object.keys(_locationData).forEach(userId => {
      _addOrUpdateMarker(userId);
    });
    _updateStatsUI();
    _updateEmptyState();

    if (shouldAutoZoom) {
      _applyAutoZoom();
    }
  }

  // ── Empty State Visibility ────────────────────────────────
  function _updateEmptyState() {
    const emptyEl = document.getElementById('livemap-empty-state');
    if (!emptyEl) return;

    const markerCount = Object.keys(_markers).length;
    if (markerCount === 0) {
      emptyEl.classList.remove('hidden');
    } else {
      emptyEl.classList.add('hidden');
    }
  }

  // ── Update Operational Stats Bar ───────────────────────────
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

  // ── Fetch Initial Locations & User Metadata ───────────────
  async function _fetchInitialData() {
    if (!_supabase) return;

    try {
      // Fetch location tracking table
      const { data: locations, error: locError } = await _supabase
        .from('user_locations')
        .select('*');

      if (locError) {
        console.error('[LiveMap] ❌ Fetch locations error:', locError.message);
        return;
      }

      // Fetch user accounts
      const { data: users, error: usrError } = await _supabase
        .from('users')
        .select('id, full_name, phone, role, email');

      if (usrError) {
        console.warn('[LiveMap] ⚠️ Fetch users warning:', usrError.message);
      }

      // Fetch worker profiles for avatar photos
      const { data: profiles, error: profError } = await _supabase
        .from('worker_profiles')
        .select('user_id, photo');

      if (profError) {
        console.warn('[LiveMap] ⚠️ Fetch profiles warning:', profError.message);
      }

      // Index user records
      _userData = {};
      if (users) {
        users.forEach(u => {
          _userData[u.id] = { ...u };
        });
      }

      // Merge profile photos
      if (profiles) {
        profiles.forEach(p => {
          if (_userData[p.user_id]) {
            _userData[p.user_id].photo = p.photo;
          } else {
            _userData[p.user_id] = { photo: p.photo };
          }
        });
      }

      // Index locations
      _locationData = {};
      if (locations) {
        locations.forEach(loc => {
          _locationData[loc.user_id] = loc;
        });
      }

      // Render markers & apply auto-zoom
      _refreshAllMarkers(true);
      _hasAppliedInitialZoom = true;

      console.log(`[LiveMap] ✅ Data loaded: ${locations?.length || 0} locations, ${users?.length || 0} users`);
    } catch (err) {
      console.error('[LiveMap] ❌ Fetch error:', err);
    }
  }

  // ── Supabase Realtime Subscription ─────────────────────────
  function _subscribeRealtime() {
    if (!_supabase) return;

    if (_realtimeChannel) {
      _supabase.removeChannel(_realtimeChannel);
      _realtimeChannel = null;
    }

    _realtimeChannel = _supabase
      .channel('user_locations_realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'user_locations',
        },
        (payload) => {
          console.log('[LiveMap] 📡 Realtime change:', payload.eventType);

          if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
            const loc = payload.new;
            const isNewUser = !_locationData[loc.user_id];
            _locationData[loc.user_id] = loc;
            _addOrUpdateMarker(loc.user_id);
            _updateStatsUI();

            // Auto-zoom if new user appeared and initial zoom is ready
            if (isNewUser && _hasAppliedInitialZoom) {
              _applyAutoZoom();
            }
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
        console.log('[LiveMap] 📡 Realtime channel status:', status);
      });
  }

  // ── Fallback Polling Loop ───────────────────────────────────
  function _startPolling() {
    if (_pollInterval) clearInterval(_pollInterval);

    _pollInterval = setInterval(async () => {
      if (!_supabase || !_isInitialized) return;

      try {
        const { data: locations } = await _supabase
          .from('user_locations')
          .select('*');

        if (locations) {
          let updated = false;
          locations.forEach(loc => {
            const existing = _locationData[loc.user_id];
            if (!existing || existing.last_updated !== loc.last_updated) {
              _locationData[loc.user_id] = loc;
              _addOrUpdateMarker(loc.user_id);
              updated = true;
            }
          });
          if (updated) {
            _updateStatsUI();
          }
        }
      } catch (e) {
        // silent fallback
      }
    }, POLL_INTERVAL);
  }

  // ── Offline Checker Interval ───────────────────────────────
  function _startOfflineCheck() {
    if (_offlineCheckInterval) clearInterval(_offlineCheckInterval);

    _offlineCheckInterval = setInterval(() => {
      Object.keys(_locationData).forEach(userId => {
        _addOrUpdateMarker(userId);
      });
      _updateStatsUI();
    }, OFFLINE_CHECK_INTERVAL);
  }

  // ── UI Filter & Search Listeners ───────────────────────────
  function _setupFilterListeners() {
    const searchInput = document.getElementById('livemap-search');
    const roleFilter = document.getElementById('livemap-role-filter');
    const statusFilter = document.getElementById('livemap-status-filter');

    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        _activeFilters.searchQuery = e.target.value.trim();
        _refreshAllMarkers(false);
      });
    }

    if (roleFilter) {
      roleFilter.addEventListener('change', (e) => {
        _activeFilters.role = e.target.value;
        _refreshAllMarkers(true);
      });
    }

    if (statusFilter) {
      statusFilter.addEventListener('change', (e) => {
        _activeFilters.status = e.target.value;
        _refreshAllMarkers(true);
      });
    }
  }

  // ── Public Interface ───────────────────────────────────────

  async function init(options) {
    if (_isInitialized) {
      destroy();
    }

    _supabase = options.supabase;
    const containerId = options.containerId || 'admin-live-map';

    const container = document.getElementById(containerId);
    if (!container) {
      console.error('[LiveMap] ❌ Map container missing:', containerId);
      return;
    }

    // Initialize Leaflet Map with Enterprise Dark Carto Tiles
    _map = L.map(containerId, {
      center: [22.5937, 78.9629],
      zoom: 5,
      minZoom: 4,
      maxZoom: 18,
      maxBounds: INDIA_BOUNDS,
      maxBoundsViscosity: 1.0,
      zoomControl: false,
      attributionControl: true,
    });

    // Custom Zoom Controls top-right
    L.control.zoom({ position: 'topright' }).addTo(_map);

    // Initialize MarkerCluster Group for anti-overlap
    _clusterGroup = L.markerClusterGroup({
      spiderfyOnMaxZoom: true,
      showCoverageOnHover: true,
      zoomToBoundsOnClick: true,
      maxClusterRadius: 45,
      disableClusteringAtZoom: 16,
      spiderfyDistanceMultiplier: 1.8,
      iconCreateFunction: function(cluster) {
        const count = cluster.getChildCount();
        let sizeClass = 'radar-cluster--sm';
        if (count >= 10) sizeClass = 'radar-cluster--lg';
        else if (count >= 5) sizeClass = 'radar-cluster--md';
        return L.divIcon({
          html: `<div class="radar-cluster ${sizeClass}"><span>${count}</span></div>`,
          className: 'radar-cluster-wrapper',
          iconSize: [44, 44],
          iconAnchor: [22, 22],
        });
      }
    });
    _map.addLayer(_clusterGroup);

    // Initial View fit India
    _map.fitBounds(INDIA_BOUNDS);

    // ── Multiple Map Tile Layers (Map Modes like Google Maps) ──
    // Standard — OpenStreetMap (shows roads, shops, places, traffic)
    const osmStandard = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19,
    });

    // Satellite — ESRI World Imagery (free satellite view)
    const esriSatellite = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      attribution: '&copy; Esri, Maxar, Earthstar Geographics',
      maxZoom: 18,
    });

    // Terrain — OpenTopoMap (topographic with elevation)
    const topoMap = L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://opentopomap.org">OpenTopoMap</a> (<a href="https://creativecommons.org/licenses/by-sa/3.0/">CC-BY-SA</a>)',
      maxZoom: 17,
    });

    // Dark Mode — OSM dark tiles via Stadia
    const darkMode = L.tileLayer('https://tiles.stadiamaps.com/tiles/alidade_smooth_dark/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; <a href="https://stadiamaps.com/">Stadia Maps</a> &copy; <a href="https://openmaptiles.org/">OpenMapTiles</a> &copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>',
      maxZoom: 20,
    });

    // Default: Standard OSM (shows places, shops, roads, everything)
    osmStandard.addTo(_map);

    // Map Mode Switcher Control
    const baseLayers = {
      '🗺️ Standard (Places & Roads)': osmStandard,
      '🛰️ Satellite View': esriSatellite,
      '⛰️ Terrain / Topographic': topoMap,
      '🌙 Dark Mode': darkMode,
    };

    L.control.layers(baseLayers, null, {
      position: 'topright',
      collapsed: true,
    }).addTo(_map);

    _setupFilterListeners();
    await _fetchInitialData();
    _subscribeRealtime();
    _startPolling();
    _startOfflineCheck();

    // ── Radar HUD Live Updates ────────────────────────────
    // Real-time clock
    function _updateRadarClock() {
      const el = document.getElementById('radar-hud-time');
      if (el) {
        const now = new Date();
        el.textContent = now.toLocaleTimeString('en-IN', { hour12: false });
      }
    }
    _updateRadarClock();
    setInterval(_updateRadarClock, 1000);

    // Zoom level display
    _map.on('zoomend', () => {
      const zoomEl = document.getElementById('radar-hud-zoom');
      if (zoomEl) zoomEl.textContent = `ZOOM: ${_map.getZoom()}x`;
    });

    // Center coordinates display
    _map.on('moveend', () => {
      const center = _map.getCenter();
      const latEl = document.getElementById('radar-hud-lat');
      const lngEl = document.getElementById('radar-hud-lng');
      if (latEl) latEl.textContent = center.lat.toFixed(4);
      if (lngEl) lngEl.textContent = center.lng.toFixed(4);
    });

    // Map mode change display
    const modeNames = {
      '🗺️ Standard (Places & Roads)': 'STANDARD',
      '🛰️ Satellite View': 'SATELLITE',
      '⛰️ Terrain / Topographic': 'TERRAIN',
      '🌙 Dark Mode': 'DARK',
    };
    _map.on('baselayerchange', (e) => {
      const modeEl = document.getElementById('radar-hud-mode');
      if (modeEl) modeEl.textContent = modeNames[e.name] || e.name;
    });

    _isInitialized = true;
    console.log('[LiveMap] 🗺️ Professional Live Map Ready');
  }

  function destroy() {
    if (_realtimeChannel && _supabase) {
      _supabase.removeChannel(_realtimeChannel);
      _realtimeChannel = null;
    }

    if (_offlineCheckInterval) {
      clearInterval(_offlineCheckInterval);
      _offlineCheckInterval = null;
    }
    if (_pollInterval) {
      clearInterval(_pollInterval);
      _pollInterval = null;
    }

    if (_clusterGroup) {
      _clusterGroup.clearLayers();
      _clusterGroup = null;
    }

    Object.values(_markers).forEach(marker => {
      if (_map) _map.removeLayer(marker);
    });
    _markers = {};

    if (_map) {
      _map.remove();
      _map = null;
    }

    _locationData = {};
    _userData = {};
    _isInitialized = false;
    _hasAppliedInitialZoom = false;
  }

  async function refresh() {
    if (!_isInitialized) return;
    await _fetchInitialData();
  }

  function invalidateSize() {
    if (_map) {
      setTimeout(() => _map.invalidateSize(), 150);
    }
  }

  return {
    init,
    destroy,
    refresh,
    invalidateSize,
  };
})();
