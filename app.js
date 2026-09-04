const SUPABASE_URL = "https://lyndjnjcncptqrsjfzey.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx5bmRqbmpjbmNwdHFyc2pmemV5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUyNTI4MzAsImV4cCI6MjEwMDgyODgzMH0.vGxSHr11ME9AMLBBXkpId7QY3Jq-MS4SBAVNKJsT_rk";

const supabaseClient = (typeof window !== 'undefined' && window.supabase)
  ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;

// Application State (Zero Local Storage - 100% Supabase Driven)
const state = {
  currentUser: null,
  currentRole: null, // 'worker' | 'customer' | 'admin'
  workers: [],
  customers: [],
  bookings: [],
  users: [],
  currentView: "home",
  pendingRegPhoto: "",
  selectedWorkerForHire: null,
  locationCache: {}, // userId -> { lat, lng, timestamp }
  fetchError: false,
  isLoading: true,
};

const VIEW_IDS = [
  'home-view',
  'labour-login-view',
  'customer-login-view',
  'labour-register-view',
  'customer-register-view',
  'labour-dashboard-view',
  'customer-dashboard-view',
  'admin-dashboard-view',
];

const elements = {
  homeView: document.getElementById("home-view"),
  labourLoginView: document.getElementById("labour-login-view"),
  customerLoginView: document.getElementById("customer-login-view"),
  labourRegisterView: document.getElementById("labour-register-view"),
  customerRegisterView: document.getElementById("customer-register-view"),
  labourDashboardView: document.getElementById("labour-dashboard-view"),
  customerDashboardView: document.getElementById("customer-dashboard-view"),
  adminDashboardView: document.getElementById("admin-dashboard-view"),
  adminSecretModal: document.getElementById("admin-secret-modal"),
  adminSecretForm: document.getElementById("admin-secret-form"),
  labourLoginForm: document.getElementById("labour-login-form"),
  customerLoginForm: document.getElementById("customer-login-form"),
  labourRegisterForm: document.getElementById("labour-register-form"),
  customerRegisterForm: document.getElementById("customer-register-form"),
  labourProfileForm: document.getElementById("labour-profile-form"),
  labourDashboardTitle: document.getElementById("labour-dashboard-title"),
  labourProfileMeta: document.getElementById("labour-profile-meta"),
  labourPhotoPreview: document.getElementById("labour-photo-preview"),
  labourPhotoPlaceholder: document.getElementById("labour-photo-placeholder"),
  dashboardCurrentRate: document.getElementById("dashboard-current-rate"),
  dashboardCurrentHours: document.getElementById("dashboard-current-hours"),
  summaryCost: document.getElementById("summary-cost"),
  summarySkill: document.getElementById("summary-skill"),
  summaryPhone: document.getElementById("summary-phone"),
  summaryEmail: document.getElementById("summary-email"),
  labourSearch: document.getElementById("labour-search"),
  skillFilter: document.getElementById("skill-filter"),
  locationFilter: document.getElementById("location-filter"),
  wageFilter: document.getElementById("wage-filter"),
  verifiedFilter: document.getElementById("verified-filter"),
  sortFilter: document.getElementById("sort-filter"),
  labourList: document.getElementById("labour-list"),
  homeLabourShowcase: document.getElementById("home-labour-showcase"),
  workerCount: document.getElementById("worker-count"),
  skillCount: document.getElementById("skill-count"),
  liveStatWorkers: document.getElementById("live-stat-workers"),
  toast: document.getElementById("toast"),
  photoModal: document.getElementById("photo-modal"),
  modalPhoto: document.getElementById("modal-photo"),
  hireModal: document.getElementById("hire-modal"),
  hireWorkerForm: document.getElementById("hire-worker-form"),
  hireWorkerName: document.getElementById("hire-worker-name"),
  hireWorkerId: document.getElementById("hire-worker-id"),
  labourRequestsList: document.getElementById("labour-requests-list"),
  adminStatWorkers: document.getElementById("admin-stat-workers"),
  adminStatCustomers: document.getElementById("admin-stat-customers"),
  adminStatPending: document.getElementById("admin-stat-pending"),
  adminStatJobs: document.getElementById("admin-stat-jobs"),
  adminVerificationList: document.getElementById("admin-verification-list"),
  adminUsersList: document.getElementById("admin-users-list"),
  deleteProfileBtn: document.getElementById("delete-profile-btn"),
  landingSections: document.getElementById("landing-sections"),
};

async function init() {
  setupEventListeners();
  showView('home');

  // Render initial skeleton state
  renderSkeletonLoaders();

  // Load all live data from Supabase
  await refreshAllData();
}

async function refreshAllData() {
  if (!supabaseClient) {
    showToast("Supabase client failed to load", "error");
    state.fetchError = true;
    renderLabourList();
    return;
  }

  state.isLoading = true;
  state.fetchError = false;

  try {
    await Promise.all([
      fetchWorkers(),
      fetchBookings(),
      fetchAdminUsers(),
      fetchUserLocations()
    ]);
  } catch (err) {
    console.error("Data refresh error:", err);
    state.fetchError = true;
  } finally {
    state.isLoading = false;
  }

  populateFilterDropdowns();
  updateCategoryCounts();
  renderLabourList();
  renderHomeShowcase();
  updateStats();
  renderAdminPanel();
  renderLabourJobRequests();
}

// ------------------------------------------------------------
// SUPABASE DATA FETCHERS
// ------------------------------------------------------------

async function fetchWorkers() {
  if (!supabaseClient) return;

  try {
    const { data, error } = await supabaseClient
      .from('worker_profiles')
      .select(`
        *,
        users (
          id,
          email,
          full_name,
          phone
        )
      `)
      .order('created_at', { ascending: false });

    if (error) {
      console.error("Fetch workers error:", error.message);
      // Fallback: fetch users directly if join fails
      const { data: usersData } = await supabaseClient.from('users').select('*').eq('role', 'worker');
      if (usersData) {
        state.workers = usersData.map(u => ({
          id: u.id,
          name: u.full_name,
          email: u.email,
          phone: u.phone,
          skill: 'Skilled Worker',
          location: 'Location Not Specified',
          cost: 800,
          hours: '9:00 AM - 6:00 PM',
          verification_status: 'pending'
        }));
      }
      return;
    }

    state.workers = (data || []).map(w => ({
      id: w.user_id,
      profile_id: w.id,
      name: w.users ? w.users.full_name : 'Worker',
      username: w.users ? (w.users.username || '') : '',
      email: w.users ? w.users.email : '',
      phone: w.users ? w.users.phone : '',
      skill: w.skill || 'Skilled Worker',
      location: w.location || 'Location Not Specified',
      cost: Number(w.daily_wage || 0),
      hours: w.hours || '9:00 AM - 6:00 PM',
      experience: w.experience || '',
      about: w.experience || '',
      rating: w.rating ? String(w.rating) : '',
      photo: w.photo || '',
      aadhaar_number: w.aadhaar_number || '',
      verification_status: w.verification_status || 'pending',
    }));
  } catch (err) {
    console.error("Error fetching workers:", err);
    state.fetchError = true;
  }
}

async function fetchBookings() {
  if (!supabaseClient) return;

  try {
    const { data, error } = await supabaseClient
      .from('bookings')
      .select('*')
      .order('created_at', { ascending: false });

    if (!error) {
      state.bookings = data || [];
    }
  } catch (err) {
    console.error("Error fetching bookings:", err);
  }
}

async function fetchAdminUsers() {
  if (!supabaseClient) return;

  try {
    const { data, error } = await supabaseClient
      .from('users')
      .select('*')
      .order('created_at', { ascending: false });

    if (!error) {
      state.users = data || [];
    }
  } catch (err) {
    console.error("Error fetching admin users:", err);
  }
}

// ------------------------------------------------------------
// DYNAMIC FILTERS & CATEGORY COUNTS
// ------------------------------------------------------------

function populateFilterDropdowns() {
  // 1. Populate Skills Filter
  const skillSelect = document.getElementById('skill-filter');
  if (skillSelect) {
    const currentVal = skillSelect.value;
    const skills = [...new Set(state.workers.map(w => w.skill).filter(Boolean))].sort();
    skillSelect.innerHTML = '<option value="all">All Categories</option>';
    skills.forEach(skill => {
      const opt = document.createElement('option');
      opt.value = skill;
      opt.textContent = skill;
      skillSelect.appendChild(opt);
    });
    if (currentVal && Array.from(skillSelect.options).some(o => o.value === currentVal)) {
      skillSelect.value = currentVal;
    }
  }

  // 2. Populate Location Filter
  const locationSelect = document.getElementById('location-filter');
  if (locationSelect) {
    const currentVal = locationSelect.value;
    const locations = [...new Set(state.workers.map(w => w.location).filter(Boolean))].sort();
    locationSelect.innerHTML = '<option value="all">All Locations</option>';
    locations.forEach(loc => {
      const opt = document.createElement('option');
      opt.value = loc;
      opt.textContent = `📍 ${loc}`;
      locationSelect.appendChild(opt);
    });
    if (currentVal && Array.from(locationSelect.options).some(o => o.value === currentVal)) {
      locationSelect.value = currentVal;
    }
  }
}

function updateCategoryCounts() {
  // Calculate real worker count per trade skill from state.workers
  const counts = {};
  state.workers.forEach(w => {
    if (w.skill) {
      counts[w.skill] = (counts[w.skill] || 0) + 1;
    }
  });

  document.querySelectorAll('.trade-card[data-skill]').forEach(card => {
    const skill = card.dataset.skill;
    const countEl = card.querySelector('.trade-card__count');
    if (countEl) {
      const num = counts[skill] || 0;
      countEl.textContent = num > 0 ? `${num} Worker${num > 1 ? 's' : ''}` : 'View Category';
    }
  });
}

window.resetAllFilters = function() {
  const searchInput = document.getElementById('labour-search');
  const skillSelect = document.getElementById('skill-filter');
  const locationSelect = document.getElementById('location-filter');
  const wageSelect = document.getElementById('wage-filter');
  const verifiedSelect = document.getElementById('verified-filter');
  const sortSelect = document.getElementById('sort-filter');

  if (searchInput) searchInput.value = '';
  if (skillSelect) skillSelect.value = 'all';
  if (locationSelect) locationSelect.value = 'all';
  if (wageSelect) wageSelect.value = 'all';
  if (verifiedSelect) verifiedSelect.value = 'all';
  if (sortSelect) sortSelect.value = 'default';

  renderLabourList();
  showToast('Filters cleared', 'info');
};

// ------------------------------------------------------------
// EVENT LISTENERS & NAVIGATION
// ------------------------------------------------------------

function renderLucideIcons() {
  if (typeof lucide !== 'undefined' && lucide.createIcons) {
    lucide.createIcons();
  }
}

function setupEventListeners() {
  document.addEventListener('click', function(e) {
    const actionEl = e.target.closest('[data-action]');
    if (actionEl) {
      e.preventDefault();
      handleAction(actionEl.dataset.action, actionEl);
      return;
    }

    const skillEl = e.target.closest('[data-skill]');
    if (skillEl) {
      filterBySkill(skillEl.dataset.skill);
    }
  });

  // Mobile navigation drawer toggle
  const mobileToggle = document.getElementById('mobile-nav-toggle');
  const navEl = document.querySelector('.topbar__nav');
  if (mobileToggle && navEl) {
    mobileToggle.addEventListener('click', function() {
      navEl.classList.toggle('topbar__nav--open');
      mobileToggle.classList.toggle('topbar__mobile-toggle--active');
    });

    navEl.querySelectorAll('.nav-link, button').forEach(function(link) {
      link.addEventListener('click', function() {
        navEl.classList.remove('topbar__nav--open');
        mobileToggle.classList.remove('topbar__mobile-toggle--active');
      });
    });
  }

  if (elements.labourLoginForm) elements.labourLoginForm.addEventListener('submit', handleLabourLogin);
  if (elements.customerLoginForm) elements.customerLoginForm.addEventListener('submit', handleCustomerLogin);
  if (elements.labourRegisterForm) elements.labourRegisterForm.addEventListener('submit', handleLabourRegister);
  if (elements.customerRegisterForm) elements.customerRegisterForm.addEventListener('submit', handleCustomerRegister);
  if (elements.labourProfileForm) elements.labourProfileForm.addEventListener('submit', handleProfileUpdate);
  if (elements.hireWorkerForm) elements.hireWorkerForm.addEventListener('submit', handleHireSubmit);
  if (elements.adminSecretForm) elements.adminSecretForm.addEventListener('submit', handleAdminSecretSubmit);

  // Search & Filter change handlers
  const filterIds = ['labour-search', 'skill-filter', 'location-filter', 'wage-filter', 'verified-filter', 'sort-filter'];
  filterIds.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      const eventName = el.tagName === 'INPUT' ? 'input' : 'change';
      el.addEventListener(eventName, renderLabourList);
    }
  });

  // Secret Keyboard Trigger: Ctrl + Shift + A
  document.addEventListener('keydown', function(e) {
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'A' || e.key === 'a')) {
      e.preventDefault();
      openAdminSecretModal();
    }
  });

  // Secret Triple Click Trigger on Brand Logo
  let logoClicks = 0;
  let logoTimer = null;
  const brandEl = document.querySelector('.brand');
  if (brandEl) {
    brandEl.addEventListener('click', function(e) {
      logoClicks++;
      clearTimeout(logoTimer);
      if (logoClicks >= 3) {
        logoClicks = 0;
        openAdminSecretModal();
      } else {
        logoTimer = setTimeout(() => { logoClicks = 0; }, 1000);
      }
    });
  }

  const regPhotoInput = document.getElementById('reg-labour-photo');
  if (regPhotoInput) {
    regPhotoInput.addEventListener('change', function(e) {
      const file = e.target.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (ev) => { state.pendingRegPhoto = ev.target.result; };
        reader.readAsDataURL(file);
      }
    });
  }

  if (elements.labourProfileForm) {
    const profilePhotoInput = elements.labourProfileForm.querySelector('input[name="photo"]');
    if (profilePhotoInput) {
      profilePhotoInput.addEventListener('change', handlePhotoUpload);
    }
  }

  if (elements.photoModal) {
    elements.photoModal.addEventListener('click', (e) => {
      if (e.target === elements.photoModal || e.target.classList.contains('modal-close')) {
        elements.photoModal.classList.add('hidden');
      }
    });
  }

  if (elements.deleteProfileBtn) {
    elements.deleteProfileBtn.addEventListener('click', handleDeleteProfile);
  }
}

function openAdminSecretModal() {
  if (elements.adminSecretModal) {
    elements.adminSecretModal.classList.remove('hidden');
    const passInput = document.getElementById('admin-passcode');
    if (passInput) passInput.focus();
  }
}

function handleAdminSecretSubmit(e) {
  e.preventDefault();
  const passcode = (document.getElementById('admin-passcode')?.value || '').trim();
  if (passcode === 'shubham18') {
    state.currentRole = 'admin';
    state.currentUser = { id: 'admin-1', full_name: 'System Admin', role: 'admin' };
    if (elements.adminSecretModal) elements.adminSecretModal.classList.add('hidden');
    e.target.reset();
    showView('admin-dashboard');
    showToast('🔓 Secret Admin Access Granted!', 'success');
  } else {
    showToast('❌ Invalid Admin Passcode!', 'error');
    shakeElement(e.target.closest('.modal-form'));
  }
}

function handleAction(action, targetEl) {
  switch (action) {
    case 'show-home':
      showView('home');
      break;
    case 'show-browse-workers':
      showView('customer-dashboard');
      break;
    case 'scroll-categories':
      if (state.currentView !== 'home') showView('home');
      setTimeout(() => {
        const catSec = document.getElementById('categories-section');
        if (catSec) catSec.scrollIntoView({ behavior: 'smooth' });
      }, 100);
      break;
    case 'scroll-how-it-works':
      if (state.currentView !== 'home') showView('home');
      setTimeout(() => {
        const hwSec = document.getElementById('how-it-works');
        if (hwSec) hwSec.scrollIntoView({ behavior: 'smooth' });
      }, 100);
      break;
    case 'show-labour-login':
      showView('labour-login');
      break;
    case 'show-customer-login':
      showView('customer-login');
      break;
    case 'show-labour-register':
      showView('labour-register');
      break;
    case 'show-customer-register':
      showView('customer-register');
      break;
    case 'show-admin-dashboard':
      if (state.currentRole === 'admin') {
        showView('admin-dashboard');
      } else {
        openAdminSecretModal();
      }
      break;
    case 'logout-labour':
    case 'logout-customer':
    case 'logout-admin':
      logoutUser();
      break;
    case 'close-modal':
      if (elements.photoModal) elements.photoModal.classList.add('hidden');
      break;
    case 'close-hire-modal':
      if (elements.hireModal) elements.hireModal.classList.add('hidden');
      break;
    case 'close-admin-secret-modal':
      if (elements.adminSecretModal) elements.adminSecretModal.classList.add('hidden');
      break;
    case 'open-hire-modal':
      if (targetEl && targetEl.dataset.workerId) {
        openHireModal(targetEl.dataset.workerId);
      }
      break;
  }
}

window.scrollToCategories = function() {
  handleAction('scroll-categories');
};

window.scrollToHowItWorks = function() {
  handleAction('scroll-how-it-works');
};

function updateNavigationUI() {
  const guestAuthEl = document.getElementById('topbar-auth-guest');
  const userAuthEl = document.getElementById('topbar-auth-user');
  const userAvatarEl = document.getElementById('topbar-user-avatar');
  const userNameEl = document.getElementById('topbar-user-name');
  const userRoleBadgeEl = document.getElementById('topbar-user-role-badge');
  const dashboardBtnEl = document.getElementById('topbar-dashboard-btn');

  if (!guestAuthEl || !userAuthEl) return;

  if (state.currentUser) {
    guestAuthEl.classList.add('hidden');
    userAuthEl.classList.remove('hidden');

    const name = state.currentUser.full_name || state.currentUser.name || 'User';
    const role = (state.currentRole || state.currentUser.role || 'user').toUpperCase();
    const initials = name.replace(/\(.*?\)/g, '').trim().split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase() || 'U';

    if (userNameEl) userNameEl.textContent = name;
    if (userRoleBadgeEl) {
      userRoleBadgeEl.textContent = role;
      userRoleBadgeEl.className = `topbar__user-role-badge topbar__user-role-badge--${role.toLowerCase()}`;
    }

    if (userAvatarEl) {
      if (state.currentUser.photo) {
        userAvatarEl.innerHTML = `<img src="${state.currentUser.photo}" alt="${name}" class="topbar__user-avatar-img" />`;
      } else {
        userAvatarEl.textContent = initials;
      }
    }

    if (dashboardBtnEl) {
      dashboardBtnEl.onclick = () => {
        if (state.currentRole === 'worker') showView('labour-dashboard');
        else if (state.currentRole === 'customer') showView('customer-dashboard');
        else if (state.currentRole === 'admin') showView('admin-dashboard');
        else showView('home');
      };
    }
  } else {
    guestAuthEl.classList.remove('hidden');
    userAuthEl.classList.add('hidden');
  }
}

function showView(viewName) {
  if (viewName === 'admin-dashboard' && state.currentRole !== 'admin') {
    openAdminSecretModal();
    showToast('🔒 Admin Security Passcode Required', 'info');
    return;
  }

  VIEW_IDS.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.add('hidden');
  });

  if (viewName === 'home') {
    if (elements.landingSections) elements.landingSections.classList.remove('hidden');
    if (elements.homeView) elements.homeView.classList.remove('hidden');
    renderHomeShowcase();
  } else {
    if (elements.landingSections) elements.landingSections.classList.add('hidden');
  }

  switch (viewName) {
    case 'labour-login':
      if (elements.labourLoginView) elements.labourLoginView.classList.remove('hidden');
      break;
    case 'customer-login':
      if (elements.customerLoginView) elements.customerLoginView.classList.remove('hidden');
      break;
    case 'labour-register':
      if (elements.labourRegisterView) elements.labourRegisterView.classList.remove('hidden');
      break;
    case 'customer-register':
      if (elements.customerRegisterView) elements.customerRegisterView.classList.remove('hidden');
      break;
    case 'labour-dashboard':
      if (elements.labourDashboardView) elements.labourDashboardView.classList.remove('hidden');
      renderLabourJobRequests();
      break;
    case 'customer-dashboard':
      if (elements.customerDashboardView) elements.customerDashboardView.classList.remove('hidden');
      renderLabourList();
      break;
    case 'admin-dashboard':
      if (elements.adminDashboardView) elements.adminDashboardView.classList.remove('hidden');
      renderAdminPanel();
      if (typeof switchAdminTab === 'function') {
        switchAdminTab('overview');
      }
      break;
  }

  state.currentView = viewName;

  document.querySelectorAll('.topbar__nav .nav-link').forEach(link => link.classList.remove('nav-link--active'));
  updateNavigationUI();
  const activeAction = `show-${viewName}`;
  const activeNav = document.querySelector(`.topbar__nav [data-action="${activeAction}"]`);
  if (activeNav) activeNav.classList.add('nav-link--active');

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ------------------------------------------------------------
// AUTHENTICATION (SUPABASE USERS)
// ------------------------------------------------------------

async function handleLabourRegister(e) {
  e.preventDefault();
  const formData = new FormData(e.target);

  const email = formData.get('email').trim();
  const username = (formData.get('username') || '').trim();
  const password = formData.get('password');
  const name = formData.get('name').trim();
  const skill = formData.get('skill');
  const cost = formData.get('cost');
  const phone = formData.get('phone').trim();
  const location = formData.get('location').trim();
  const about = formData.get('about') || '';

  if (!name || !email || !password || !skill || !cost || !phone || !location) {
    showToast('Please fill in all required worker details', 'error');
    return;
  }

  if (!supabaseClient) return;

  try {
    let userPayload = { email, username, full_name: name, phone, role: 'worker' };
    let { data: userData, error: userError } = await supabaseClient
      .from('users')
      .insert([userPayload])
      .select()
      .single();

    if (userError && userError.message && userError.message.includes('username')) {
      delete userPayload.username;
      const retry = await supabaseClient.from('users').insert([userPayload]).select().single();
      userData = retry.data;
      userError = retry.error;
    }

    if (userError) {
      showToast(userError.message || 'Worker registration failed', 'error');
      return;
    }

    const { error: profileError } = await supabaseClient
      .from('worker_profiles')
      .insert([{
        user_id: userData.id,
        skill,
        location,
        daily_wage: parseInt(cost),
        experience: about,
        photo: state.pendingRegPhoto || '',
        verification_status: 'pending'
      }]);

    if (profileError) {
      console.error("Worker profile error:", profileError);
    }

    state.pendingRegPhoto = "";
    e.target.reset();
    await refreshAllData();
    showToast('🎉 Worker Registration Successful! Please Sign In.', 'success');
    setTimeout(() => showView('labour-login'), 1200);
  } catch (err) {
    console.error("Worker Registration error:", err);
    showToast('Error registering worker account', 'error');
  }
}

async function handleCustomerRegister(e) {
  e.preventDefault();
  const formData = new FormData(e.target);

  const name = formData.get('name').trim();
  const username = (formData.get('username') || '').trim();
  const email = formData.get('email').trim();
  const password = formData.get('password');
  const phone = formData.get('phone').trim();
  const address = formData.get('address').trim();

  if (!name || !email || !password || !phone || !address) {
    showToast('Please fill in all customer fields', 'error');
    return;
  }

  if (!supabaseClient) return;

  try {
    let userPayload = { email, username, full_name: name, phone, role: 'customer' };
    let { data: userData, error: userError } = await supabaseClient
      .from('users')
      .insert([userPayload])
      .select()
      .single();

    if (userError && userError.message && userError.message.includes('username')) {
      delete userPayload.username;
      const retry = await supabaseClient.from('users').insert([userPayload]).select().single();
      userData = retry.data;
      userError = retry.error;
    }

    if (userError) {
      showToast(userError.message || 'Customer registration failed', 'error');
      return;
    }

    await supabaseClient
      .from('customer_profiles')
      .insert([{
        user_id: userData.id,
        address,
        phone
      }]);

    e.target.reset();
    await refreshAllData();
    showToast('🎉 Customer Account Created! Please Sign In.', 'success');
    setTimeout(() => showView('customer-login'), 1200);
  } catch (err) {
    console.error("Customer Registration error:", err);
    showToast('Error registering customer account', 'error');
  }
}

async function findUserInDb(inputVal, role) {
  if (!supabaseClient) return { users: [] };

  let { data: usersData, error } = await supabaseClient
    .from('users')
    .select('*')
    .or(`email.ilike.%${inputVal}%,username.ilike.%${inputVal}%,full_name.ilike.%${inputVal}%,phone.ilike.%${inputVal}%`)
    .eq('role', role);

  if (error && error.message && (error.message.includes('username') || error.code === 'PGRST204')) {
    const fallback = await supabaseClient
      .from('users')
      .select('*')
      .or(`email.ilike.%${inputVal}%,full_name.ilike.%${inputVal}%,phone.ilike.%${inputVal}%`)
      .eq('role', role);
    usersData = fallback.data;
    error = fallback.error;
  }

  if (error || !usersData || usersData.length === 0) {
    const allUsers = await supabaseClient.from('users').select('*').eq('role', role);
    if (allUsers.data && allUsers.data.length > 0) {
      const match = allUsers.data.find(u => 
        (u.email && u.email.toLowerCase().includes(inputVal)) ||
        (u.full_name && u.full_name.toLowerCase().includes(inputVal)) ||
        (u.username && u.username.toLowerCase().includes(inputVal)) ||
        (u.phone && u.phone.includes(inputVal))
      );
      if (match) return { users: [match] };
    }
  }

  if (error) {
    return { error: error.message };
  }

  return { users: usersData || [] };
}

async function handleLabourLogin(e) {
  e.preventDefault();
  const formData = new FormData(e.target);
  const inputVal = formData.get('username').trim().toLowerCase();

  await refreshAllData();

  let worker = state.workers.find(w => 
    (w.username && w.username.toLowerCase() === inputVal) ||
    w.email.toLowerCase() === inputVal || 
    w.name.toLowerCase() === inputVal ||
    w.name.toLowerCase().includes(inputVal) ||
    (w.phone && w.phone.replace(/[^0-9]/g, '') === inputVal.replace(/[^0-9]/g, ''))
  );

  if (!worker) {
    const res = await findUserInDb(inputVal, 'worker');
    if (res.error) {
      showToast(`Supabase Error: ${res.error}`, 'error');
      return;
    }
    if (res.users && res.users.length > 0) {
      const u = res.users[0];
      worker = {
        id: u.id,
        name: u.full_name,
        username: u.username || '',
        email: u.email,
        phone: u.phone,
        skill: 'Skilled Worker',
        location: 'Location Not Specified',
        cost: 800,
        hours: '9:00 AM - 6:00 PM',
        verification_status: 'pending'
      };
    }
  }

  if (worker) {
    state.currentUser = worker;
    state.currentRole = 'worker';
    e.target.reset();

    if (typeof LocationService !== 'undefined' && supabaseClient) {
      LocationService.init({
        supabase: supabaseClient,
        userId: worker.id,
        userRole: 'worker',
        userName: worker.name,
        onPermissionGranted: () => {
          console.log('[App] ✅ GPS permission granted for worker');
        },
        onPermissionDenied: () => {
          showToast('📍 Location permission required for live tracking', 'info');
        },
        onLocationUpdate: (pos) => {},
        onError: (type, msg) => {},
      });
    }

    showLabourDashboard(worker);
    showToast(`Welcome back, ${worker.name}!`, 'success');
  } else {
    showToast('Worker account not found! Use registered Username, Email, Name, or Phone.', 'error');
    shakeElement(e.target.closest('.login-page__card'));
  }
}

async function handleCustomerLogin(e) {
  e.preventDefault();
  const formData = new FormData(e.target);
  const inputVal = formData.get('username').trim().toLowerCase();

  await refreshAllData();

  let customerUser = state.users.find(u => 
    u.role === 'customer' && 
    ((u.username && u.username.toLowerCase() === inputVal) || u.email.toLowerCase() === inputVal || u.full_name.toLowerCase().includes(inputVal) || (u.phone && u.phone.includes(inputVal)))
  );

  if (!customerUser) {
    const res = await findUserInDb(inputVal, 'customer');
    if (res.error) {
      showToast(`Supabase Error: ${res.error}`, 'error');
      return;
    }
    if (res.users && res.users.length > 0) {
      customerUser = res.users[0];
    }
  }

  if (customerUser) {
    state.currentUser = customerUser;
    state.currentRole = 'customer';
    e.target.reset();

    if (typeof LocationService !== 'undefined' && supabaseClient) {
      LocationService.init({
        supabase: supabaseClient,
        userId: customerUser.id,
        userRole: 'customer',
        userName: customerUser.full_name,
        onPermissionGranted: () => {},
        onPermissionDenied: () => {},
        onLocationUpdate: (pos) => {},
        onError: (type, msg) => {},
      });
    }

    showCustomerDashboard(customerUser);
    showToast(`Welcome back, ${customerUser.full_name}!`, 'success');
  } else {
    showToast('Customer account not found! Use registered Username, Email, Name, or Phone.', 'error');
    shakeElement(e.target.closest('.login-page__card'));
  }
}

function logoutUser() {
  if (typeof LocationService !== 'undefined') {
    LocationService.stop();
  }
  if (typeof LiveMap !== 'undefined') {
    LiveMap.destroy();
  }

  _adminLiveMapInitialized = false;
  state.currentUser = null;
  state.currentRole = null;
  showView('home');
  showToast('Logged out successfully', 'info');
}

// ------------------------------------------------------------
// WORKER DASHBOARD & PROFILE MANAGEMENT
// ------------------------------------------------------------

function showLabourDashboard(labour) {
  showView('labour-dashboard');

  if (elements.labourDashboardTitle) elements.labourDashboardTitle.textContent = `Welcome, ${labour.name}`;
  if (elements.labourProfileMeta) elements.labourProfileMeta.textContent = `${labour.skill} • ${labour.location}`;

  if (labour.photo) {
    if (elements.labourPhotoPreview) {
      elements.labourPhotoPreview.src = labour.photo;
      elements.labourPhotoPreview.classList.remove('hidden');
    }
    if (elements.labourPhotoPlaceholder) elements.labourPhotoPlaceholder.classList.add('hidden');
  } else {
    if (elements.labourPhotoPreview) elements.labourPhotoPreview.classList.add('hidden');
    if (elements.labourPhotoPlaceholder) {
      elements.labourPhotoPlaceholder.classList.remove('hidden');
      elements.labourPhotoPlaceholder.textContent = labour.name.split(' ').map(n => n[0]).slice(0, 2).join('');
    }
  }

  if (elements.dashboardCurrentRate) elements.dashboardCurrentRate.textContent = `₹${labour.cost}`;
  if (elements.dashboardCurrentHours) elements.dashboardCurrentHours.textContent = labour.hours || '9 AM - 6 PM';

  if (elements.summarySkill) elements.summarySkill.textContent = labour.skill;
  if (elements.summaryCost) elements.summaryCost.textContent = `₹${labour.cost} / day`;
  if (elements.summaryPhone) elements.summaryPhone.textContent = labour.phone;
  if (elements.summaryEmail) elements.summaryEmail.textContent = labour.email;

  const form = elements.labourProfileForm;
  if (form) {
    form.name.value = labour.name;
    form.skill.value = labour.skill;
    form.email.value = labour.email;
    form.cost.value = labour.cost;
    form.phone.value = labour.phone;
    form.location.value = labour.location;
    form.hours.value = labour.hours || '9:00 AM - 6:00 PM';
    form.about.value = labour.about || '';
  }

  renderLabourJobRequests();
}

function showCustomerDashboard(customer) {
  showView('customer-dashboard');

  const profileName = document.querySelector('.cust-profile-bar__info h3');
  if (profileName && customer.full_name) {
    profileName.textContent = `Welcome, ${customer.full_name}`;
  }

  renderLabourList();
  populateFilterDropdowns();
  updateStats();
  renderCustomerBookings();
}

function renderCustomerBookings() {
  const bookingsContainer = document.getElementById('customer-bookings-list');
  if (!bookingsContainer) return;

  const customerId = state.currentUser ? state.currentUser.id : null;
  if (!customerId) return;

  const myBookings = state.bookings.filter(b => b.customer_id === customerId);

  bookingsContainer.innerHTML = '';

  if (myBookings.length === 0) {
    bookingsContainer.innerHTML = `
      <div class="empty-state">
        <div class="empty-state__icon">📋</div>
        <h3>No bookings yet</h3>
        <p>When you hire a worker, your booking details will appear here with full worker contact info!</p>
      </div>
    `;
    return;
  }

  myBookings.forEach(booking => {
    const card = document.createElement('div');
    card.className = 'booking-card';

    const worker = state.workers.find(w => w.id === booking.worker_id);
    const workerName = worker ? worker.name : 'Worker';
    const workerPhone = worker ? worker.phone : '';
    const workerEmail = worker ? worker.email : '';
    const workerSkill = worker ? worker.skill : 'Skilled Worker';
    const workerLocation = worker ? worker.location : '';
    const workerPhoto = worker ? worker.photo : '';
    const workerRating = worker ? worker.rating : '';
    const workerInitials = workerName.replace(/\(.*?\)/g, '').trim().split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase();

    const statusBadge = booking.status === 'accepted'
      ? `<span class="badge-approved">✅ Accepted</span>`
      : booking.status === 'rejected'
      ? `<span class="badge-rejected">❌ Rejected</span>`
      : `<span class="badge-pending">⏳ Pending</span>`;

    const notesStr = booking.notes || '';
    const jobTitle = notesStr.split('|')[0]?.trim() || 'Job Booking';
    const jobLocation = extractField(notesStr, 'Location') || '';

    const skillIcons = {
      'Electrician': '⚡', 'Plumber': '🔧', 'Carpenter': '🪚', 'Mason': '🧱',
      'Painter': '🎨', 'Welder': '🔥', 'AC Repair': '❄️', 'Mechanic': '🔩',
      'Driver': '🚗', 'Gardener': '🌿', 'Cleaner': '🧹', 'Security Guard': '🛡️',
      'Construction Worker': '🏗️',
    };
    const skillIcon = skillIcons[workerSkill] || '👷';

    card.innerHTML = `
      <div class="booking-card__header">
        <div class="booking-card__worker-avatar">
          ${workerPhoto ? `<img src="${workerPhoto}" alt="${workerName}" />` : `<span>${workerInitials}</span>`}
        </div>
        <div class="booking-card__worker-info">
          <h4 class="booking-card__worker-name">${workerName}</h4>
          <div class="booking-card__worker-skill">${skillIcon} ${workerSkill} ${workerRating ? `• ⭐ ${workerRating}` : ''}</div>
        </div>
        ${statusBadge}
      </div>

      <div class="booking-card__details">
        <div class="booking-card__detail"><span>📋</span><strong>Job:</strong> ${jobTitle}</div>
        <div class="booking-card__detail"><span>📅</span><strong>Date:</strong> ${booking.booking_date || 'Immediate'}</div>
        <div class="booking-card__detail"><span>💰</span><strong>Rate:</strong> ₹${booking.daily_wage || 0}/day</div>
        ${jobLocation ? `<div class="booking-card__detail"><span>📍</span><strong>Location:</strong> ${jobLocation}</div>` : ''}
        ${workerLocation ? `<div class="booking-card__detail"><span>🏠</span><strong>Worker Area:</strong> ${workerLocation}</div>` : ''}
      </div>

      <div class="booking-card__worker-contact">
        <div class="booking-card__contact-label">📞 Worker Contact Details (मज़दूर संपर्क)</div>
        ${workerPhone ? `<div class="booking-card__detail"><span>📱</span><strong>Phone:</strong> <a href="tel:${workerPhone}" class="booking-card__link">${workerPhone}</a></div>` : ''}
        ${workerEmail ? `<div class="booking-card__detail"><span>✉️</span><strong>Email:</strong> ${workerEmail}</div>` : ''}
      </div>

      <div class="booking-card__actions">
        ${workerPhone ? `
          <a href="tel:${workerPhone}" class="booking-card__btn booking-card__btn--call">📞 Call Worker</a>
          <a href="https://wa.me/${workerPhone.replace(/[^0-9]/g, '')}" target="_blank" class="booking-card__btn booking-card__btn--whatsapp">💬 WhatsApp</a>
        ` : ''}
      </div>
    `;
    bookingsContainer.appendChild(card);
  });
}

async function handleProfileUpdate(e) {
  e.preventDefault();
  if (!state.currentUser || !supabaseClient) return;

  const formData = new FormData(e.target);
  const workerId = state.currentUser.id;

  const name = formData.get('name').trim();
  const skill = formData.get('skill');
  const cost = parseInt(formData.get('cost'));
  const phone = formData.get('phone').trim();
  const location = formData.get('location').trim();
  const hours = formData.get('hours').trim();
  const about = formData.get('about') || '';

  try {
    await supabaseClient
      .from('users')
      .update({ full_name: name, phone })
      .eq('id', workerId);

    await supabaseClient
      .from('worker_profiles')
      .update({
        skill,
        daily_wage: cost,
        location,
        hours,
        experience: about
      })
      .eq('user_id', workerId);

    await refreshAllData();
    const updatedWorker = state.workers.find(w => w.id === workerId);
    if (updatedWorker) {
      state.currentUser = updatedWorker;
      showLabourDashboard(updatedWorker);
    }
    showToast('✅ Profile Details Updated!', 'success');
  } catch (err) {
    console.error("Profile update error:", err);
    showToast('Failed to update profile details', 'error');
  }
}

async function handlePhotoUpload(e) {
  const file = e.target.files[0];
  if (file && state.currentUser && supabaseClient) {
    if (file.size > 3 * 1024 * 1024) {
      showToast('Photo must be under 3MB', 'error');
      return;
    }
    const reader = new FileReader();
    reader.onload = async (event) => {
      const photoData = event.target.result;

      await supabaseClient
        .from('worker_profiles')
        .update({ photo: photoData })
        .eq('user_id', state.currentUser.id);

      await refreshAllData();
      const updated = state.workers.find(w => w.id === state.currentUser.id);
      if (updated) {
        state.currentUser = updated;
        showLabourDashboard(updated);
      }
      showToast('📷 Photo updated successfully!', 'success');
    };
    reader.readAsDataURL(file);
  }
}

async function handleDeleteProfile() {
  if (confirm('Are you sure you want to delete your worker profile?')) {
    if (state.currentUser && supabaseClient) {
      await supabaseClient
        .from('users')
        .delete()
        .eq('id', state.currentUser.id);

      await refreshAllData();
      logoutUser();
      showToast('Profile deleted permanently', 'success');
    }
  }
}

// ------------------------------------------------------------
// DIRECT HIRING & JOB REQUEST FLOW
// ------------------------------------------------------------

function openHireModal(workerId) {
  if (!state.currentUser || state.currentRole !== 'customer') {
    showToast('🔒 Please Sign In as Customer to hire workers', 'info');
    setTimeout(() => showView('customer-login'), 800);
    return;
  }

  const worker = state.workers.find(w => w.id === workerId);
  if (!worker) return;

  state.selectedWorkerForHire = worker;
  if (elements.hireWorkerName) elements.hireWorkerName.textContent = `Worker: ${worker.name} • (${worker.skill} - ₹${worker.cost}/day)`;
  if (elements.hireWorkerId) elements.hireWorkerId.value = worker.id;
  if (elements.hireModal) elements.hireModal.classList.remove('hidden');
}

async function handleHireSubmit(e) {
  e.preventDefault();

  if (!state.currentUser || state.currentRole !== 'customer') {
    showToast('🔒 Please Sign In as Customer to send hire requests', 'error');
    if (elements.hireModal) elements.hireModal.classList.add('hidden');
    showView('customer-login');
    return;
  }

  if (!supabaseClient || !state.selectedWorkerForHire) return;

  const formData = new FormData(e.target);
  const title = formData.get('title').trim();
  const location = formData.get('location').trim();
  const bookingDate = formData.get('booking_date');
  const notes = formData.get('notes') || '';

  const customerId = state.currentUser.id;
  const customerName = state.currentUser.full_name || state.currentUser.name || 'Customer';
  const customerPhone = state.currentUser.phone || '';

  let customerAddress = location;
  try {
    const { data: cpData } = await supabaseClient
      .from('customer_profiles')
      .select('address')
      .eq('user_id', customerId)
      .single();
    if (cpData && cpData.address) {
      customerAddress = cpData.address;
    }
  } catch (err) {
    console.warn('Could not fetch customer address:', err);
  }

  try {
    const { error } = await supabaseClient
      .from('bookings')
      .insert([{
        worker_id: state.selectedWorkerForHire.id,
        customer_id: customerId,
        daily_wage: state.selectedWorkerForHire.cost,
        booking_date: bookingDate,
        notes: `${title} | Location: ${location} | Notes: ${notes} | CustomerName: ${customerName} | CustomerPhone: ${customerPhone} | CustomerAddress: ${customerAddress}`,
        status: 'pending'
      }]);

    if (error) {
      showToast(error.message || 'Hiring request failed', 'error');
      return;
    }

    if (elements.hireModal) elements.hireModal.classList.add('hidden');
    e.target.reset();
    await refreshAllData();
    showToast('🎉 Hiring request sent to worker directly!', 'success');
  } catch (err) {
    console.error("Hire submit error:", err);
    showToast('Failed to send hiring request', 'error');
  }
}

function renderLabourJobRequests() {
  if (!elements.labourRequestsList) return;

  const activeWorkerId = state.currentUser ? state.currentUser.id : null;
  const requests = state.bookings.filter(b => b.worker_id === activeWorkerId);

  elements.labourRequestsList.innerHTML = '';

  if (requests.length === 0) {
    elements.labourRequestsList.innerHTML = `
      <div class="empty-state">
        <div class="empty-state__icon">📋</div>
        <h3>No pending job requests</h3>
        <p>When customers hire you directly, job requests will appear here instantly!</p>
      </div>
    `;
    return;
  }

  requests.forEach(req => {
    const card = document.createElement('div');
    card.className = 'request-card';
    const statusBadge = req.status === 'accepted'
      ? `<span class="badge-approved">Accepted ✅</span>`
      : req.status === 'rejected'
      ? `<span class="badge-rejected">Rejected</span>`
      : `<span class="badge-pending">Pending Request</span>`;

    const notesStr = req.notes || '';
    const customerName = extractField(notesStr, 'CustomerName') || 'Customer';
    const customerPhone = extractField(notesStr, 'CustomerPhone') || '';
    const customerAddress = extractField(notesStr, 'CustomerAddress') || '';
    const jobLocation = extractField(notesStr, 'Location') || '';
    const jobTitle = notesStr.split('|')[0]?.trim() || 'Direct Job Booking';
    const jobNotes = extractField(notesStr, 'Notes') || '';

    const customerUser = state.users.find(u => u.id === req.customer_id);
    const displayName = customerName !== 'Customer' ? customerName : (customerUser?.full_name || 'Customer');
    const displayPhone = customerPhone || customerUser?.phone || '';

    card.innerHTML = `
      <div class="request-card__header">
        <h4 class="request-card__title">📋 ${jobTitle}</h4>
        ${statusBadge}
      </div>

      <div class="request-card__customer-info">
        <div class="request-card__customer-label">👤 Customer Details (ग्राहक की जानकारी)</div>
        <div class="request-card__detail"><span class="request-card__detail-icon">👤</span><strong>Name:</strong> ${displayName}</div>
        <div class="request-card__detail"><span class="request-card__detail-icon">📱</span><strong>Phone:</strong> ${displayPhone ? `<a href="tel:${displayPhone}" class="request-card__link">${displayPhone}</a>` : 'Not provided'}</div>
        <div class="request-card__detail"><span class="request-card__detail-icon">📍</span><strong>Address:</strong> ${customerAddress || 'Not provided'}</div>
        <div class="request-card__detail"><span class="request-card__detail-icon">🏗️</span><strong>Work Site:</strong> ${jobLocation || customerAddress || 'Not specified'}</div>
      </div>

      <div class="request-card__job-info">
        <div><strong>📅 Date:</strong> ${req.booking_date || 'Immediate'}</div>
        <div><strong>💰 Daily Rate:</strong> ₹${req.daily_wage || 0}/day</div>
        ${jobNotes ? `<div><strong>📝 Notes:</strong> ${jobNotes}</div>` : ''}
      </div>

      ${displayPhone ? `
        <div class="request-card__contact-actions">
          <a href="tel:${displayPhone}" class="request-card__contact-btn request-card__contact-btn--call">📞 Call Customer</a>
          <a href="https://wa.me/${displayPhone.replace(/[^0-9]/g, '')}" target="_blank" class="request-card__contact-btn request-card__contact-btn--whatsapp">💬 WhatsApp</a>
        </div>
      ` : ''}

      ${req.status === 'pending' ? `
        <div class="request-card__actions">
          <button class="btn-accept" onclick="updateBookingStatus('${req.id}', 'accepted')">✅ Accept Job</button>
          <button class="btn-reject" onclick="updateBookingStatus('${req.id}', 'rejected')">❌ Reject</button>
        </div>
      ` : ''}
    `;
    elements.labourRequestsList.appendChild(card);
  });
}

function extractField(notesStr, fieldName) {
  const regex = new RegExp(fieldName + ':\\s*([^|]*)', 'i');
  const match = notesStr.match(regex);
  return match ? match[1].trim() : '';
}

window.updateBookingStatus = async function(bookingId, newStatus) {
  if (!supabaseClient) return;

  try {
    await supabaseClient
      .from('bookings')
      .update({ status: newStatus })
      .eq('id', bookingId);

    await refreshAllData();
    showToast(`Job booking request ${newStatus}!`, 'success');
  } catch (err) {
    console.error("Update booking status error:", err);
  }
};

// ------------------------------------------------------------
// ADMIN DASHBOARD & VERIFICATION MANAGEMENT
// ------------------------------------------------------------

function renderAdminPanel() {
  if (!elements.adminDashboardView) return;

  const totalWorkers = state.workers.length;
  const totalCustomers = state.users.filter(u => u.role === 'customer').length;
  const pendingRequests = state.workers.filter(w => w.verification_status === 'pending').length;
  const totalJobs = state.bookings.length;

  if (elements.adminStatWorkers) elements.adminStatWorkers.textContent = totalWorkers;
  if (elements.adminStatCustomers) elements.adminStatCustomers.textContent = totalCustomers;
  if (elements.adminStatPending) elements.adminStatPending.textContent = pendingRequests;
  if (elements.adminStatJobs) elements.adminStatJobs.textContent = totalJobs;

  if (elements.adminVerificationList) {
    elements.adminVerificationList.innerHTML = '';
    const pendingWorkers = state.workers.filter(w => w.verification_status === 'pending');

    if (pendingWorkers.length === 0) {
      elements.adminVerificationList.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--muted); padding: 20px;">No pending verification requests. All workers verified!</td></tr>`;
    } else {
      pendingWorkers.forEach(w => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td><strong>${w.name}</strong></td>
          <td>${w.skill}</td>
          <td>${w.location}</td>
          <td>${w.aadhaar_number || 'Aadhaar Provided'}</td>
          <td>₹${w.cost}/day</td>
          <td><span class="badge-pending">Pending Approval</span></td>
          <td>
            <button class="btn-verify-approve" onclick="verifyWorker('${w.profile_id}', 'approved')">Approve ✓</button>
            <button class="btn-verify-reject" onclick="verifyWorker('${w.profile_id}', 'rejected')">Reject ✕</button>
          </td>
        `;
        elements.adminVerificationList.appendChild(tr);
      });
    }
  }

  if (elements.adminUsersList) {
    elements.adminUsersList.innerHTML = '';
    if (state.users.length === 0) {
      elements.adminUsersList.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--muted); padding: 20px;">No registered users found.</td></tr>`;
    } else {
      state.users.forEach(u => {
        const tr = document.createElement('tr');
        const regDate = u.created_at ? new Date(u.created_at).toLocaleDateString() : 'Recent';
        const locData = state.locationCache[u.id];
        const hasLocation = locData && locData.lat && locData.lng;
        const lastSeen = hasLocation && locData.timestamp
          ? getTimeAgo(locData.timestamp)
          : '';

        let locationCell;
        if (hasLocation) {
          locationCell = `
            <div style="display: flex; flex-direction: column; gap: 4px;">
              <button class="btn-verify-approve" onclick="openLocationMap('${u.id}', '${(u.full_name || '').replace(/'/g, "\\'")}')"
                style="font-size: 0.7rem; padding: 5px 10px; display: flex; align-items: center; gap: 4px; white-space: nowrap;">
                📍 View Map
              </button>
              <span style="font-size: 0.65rem; color: #94a3b8;">🟢 ${lastSeen}</span>
            </div>`;
        } else {
          locationCell = `<span style="color: #64748b; font-size: 0.75rem;">⚫ Offline</span>`;
        }

        tr.innerHTML = `
          <td><strong>${u.full_name}</strong></td>
          <td>${u.email}</td>
          <td><span class="badge-approved">${u.role.toUpperCase()}</span></td>
          <td>${u.phone || '-'}</td>
          <td>${locationCell}</td>
          <td>${regDate}</td>
          <td>
            <button class="btn-verify-reject" onclick="deleteUserAdmin('${u.id}')">Delete User</button>
          </td>
        `;
        elements.adminUsersList.appendChild(tr);
      });
    }
  }
}

window.verifyWorker = async function(profileId, newStatus) {
  if (!supabaseClient) return;

  try {
    await supabaseClient
      .from('worker_profiles')
      .update({ verification_status: newStatus })
      .eq('id', profileId);

    await refreshAllData();
    showToast(`Worker verification status set to: ${newStatus}`, 'success');
  } catch (err) {
    console.error("Verify worker error:", err);
  }
};

window.deleteUserAdmin = async function(userId) {
  if (confirm('Admin Action: Delete this user and all associated profile data?')) {
    if (!supabaseClient) return;

    try {
      await supabaseClient
        .from('users')
        .delete()
        .eq('id', userId);

      await refreshAllData();
      showToast('User account deleted', 'success');
    } catch (err) {
      console.error("Delete user error:", err);
    }
  }
};

// ------------------------------------------------------------
// WORKER DIRECTORY CARDS & MARKETPLACE RENDERING
// ------------------------------------------------------------

function filterBySkill(skill) {
  const skillSelect = document.getElementById('skill-filter');
  if (skillSelect) skillSelect.value = skill;
  showView('customer-dashboard');
  renderLabourList();
  showToast(`Filtered workers by: ${skill}`, 'info');
}

function renderSkeletonLoaders() {
  if (elements.labourList) {
    elements.labourList.innerHTML = Array(6).fill(0).map(() => `
      <div class="labour-card labour-card--skeleton">
        <div class="skeleton-avatar"></div>
        <div class="skeleton-line skeleton-line--title"></div>
        <div class="skeleton-line skeleton-line--subtitle"></div>
        <div class="skeleton-line skeleton-line--body"></div>
        <div class="skeleton-line skeleton-line--btn"></div>
      </div>
    `).join('');
  }

  if (elements.homeLabourShowcase) {
    elements.homeLabourShowcase.innerHTML = Array(3).fill(0).map(() => `
      <div class="labour-card labour-card--skeleton">
        <div class="skeleton-avatar"></div>
        <div class="skeleton-line skeleton-line--title"></div>
        <div class="skeleton-line skeleton-line--subtitle"></div>
        <div class="skeleton-line skeleton-line--btn"></div>
      </div>
    `).join('');
  }
}

function renderHomeShowcase() {
  if (!elements.homeLabourShowcase) return;

  if (state.isLoading) {
    renderSkeletonLoaders();
    return;
  }

  elements.homeLabourShowcase.innerHTML = '';

  const showcaseWorkers = state.workers.slice(0, 6);

  if (showcaseWorkers.length === 0) {
    elements.homeLabourShowcase.innerHTML = `
      <div class="empty-state">
        <div class="empty-state__icon">👷</div>
        <h3>No workers found</h3>
        <p>Try changing your category or location.</p>
        <button class="button-v2 button-v2--secondary" onclick="resetAllFilters()">Clear Filters</button>
      </div>
    `;
    return;
  }

  showcaseWorkers.forEach((labour, index) => {
    const card = createLabourCard(labour, index);
    elements.homeLabourShowcase.appendChild(card);
  });
}

function renderLabourList() {
  if (!elements.labourList) return;

  if (state.isLoading) {
    renderSkeletonLoaders();
    return;
  }

  if (state.fetchError) {
    elements.labourList.innerHTML = `
      <div class="empty-state empty-state--error">
        <div class="empty-state__icon">⚠️</div>
        <h3>Unable to load workers right now.</h3>
        <p>Please try again.</p>
        <button class="button-v2 button-v2--primary" onclick="refreshAllData()">Retry</button>
      </div>
    `;
    return;
  }

  const searchVal = (document.getElementById('labour-search')?.value || '').trim().toLowerCase();
  const locationVal = document.getElementById('location-filter')?.value || 'all';
  const skillVal = document.getElementById('skill-filter')?.value || 'all';
  const wageVal = document.getElementById('wage-filter')?.value || 'all';
  const verifiedVal = document.getElementById('verified-filter')?.value || 'all';
  const sortVal = document.getElementById('sort-filter')?.value || 'default';

  let filtered = state.workers.filter(labour => {
    // Search matching
    const matchesSearch = !searchVal || 
      labour.name.toLowerCase().includes(searchVal) ||
      labour.skill.toLowerCase().includes(searchVal) ||
      labour.location.toLowerCase().includes(searchVal) ||
      (labour.about && labour.about.toLowerCase().includes(searchVal));

    // Location matching
    const matchesLocation = locationVal === 'all' || labour.location.toLowerCase().includes(locationVal.toLowerCase());

    // Skill matching
    const matchesSkill = skillVal === 'all' || labour.skill === skillVal;

    // Wage matching
    let matchesWage = true;
    if (wageVal === 'under700') matchesWage = labour.cost < 700;
    else if (wageVal === '700-1000') matchesWage = labour.cost >= 700 && labour.cost <= 1000;
    else if (wageVal === 'above1000') matchesWage = labour.cost > 1000;

    // Verification status matching
    const matchesVerified = verifiedVal === 'all' || labour.verification_status === 'approved';

    return matchesSearch && matchesLocation && matchesSkill && matchesWage && matchesVerified;
  });

  // Sorting
  if (sortVal === 'wage-low') {
    filtered.sort((a, b) => a.cost - b.cost);
  } else if (sortVal === 'wage-high') {
    filtered.sort((a, b) => b.cost - a.cost);
  } else if (sortVal === 'rating') {
    filtered.sort((a, b) => (Number(b.rating) || 0) - (Number(a.rating) || 0));
  }

  elements.labourList.innerHTML = '';

  if (filtered.length === 0) {
    elements.labourList.innerHTML = `
      <div class="empty-state">
        <div class="empty-state__icon">🔍</div>
        <h3>No workers found</h3>
        <p>Try changing your category or location.</p>
        <button class="button-v2 button-v2--primary" onclick="resetAllFilters()">Clear Filters</button>
      </div>
    `;
    return;
  }

  filtered.forEach((labour, index) => {
    const card = createLabourCard(labour, index);
    elements.labourList.appendChild(card);
  });
}

function createLabourCard(labour, index) {
  const card = document.createElement('div');
  card.className = 'labour-card';
  card.style.animationDelay = `${index * 0.04}s`;

  const photoSrc = labour.photo || '';
  const initials = labour.name.replace(/\(.*?\)/g, '').trim().split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase();

  const skillIcons = {
    'Electrician': '⚡', 'Plumber': '🔧', 'Carpenter': '🪚', 'Mason': '🧱',
    'Painter': '🎨', 'Welder': '🔥', 'AC Repair': '❄️', 'Mechanic': '🔩',
    'Driver': '🚗', 'Gardener': '🌿', 'Cleaner': '🧹', 'Security Guard': '🛡️',
    'Construction Worker': '🏗️',
  };
  const skillIcon = skillIcons[labour.skill] || '👷';
  
  // Conditional Badge & Information Rendering
  const isApproved = labour.verification_status === 'approved';
  const hasRating = labour.rating && Number(labour.rating) > 0;
  const hasExperience = labour.about && labour.about.trim().length > 0;

  card.innerHTML = `
    <div class="labour-card__body">
      <div class="labour-card__top">
        <div class="labour-card__avatar" onclick="showPhotoModal('${photoSrc.replace(/'/g, "\\'")}', '${labour.name.replace(/'/g, "\\'")}')">
          ${photoSrc ? `<img src="${photoSrc}" alt="${labour.name}" />` : `<span>${initials}</span>`}
        </div>
        <div class="labour-card__header-info">
          <div class="labour-card__name">${labour.name}</div>
          <div class="labour-card__skill">${skillIcon} ${labour.skill}</div>
          <div class="labour-card__meta">
            <span class="labour-card__location">
              <svg width="14" height="14" viewBox="0 0 18 18" fill="none"><path d="M9 16s-6-5.3-6-9a6 6 0 0112 0c0 3.7-6 9-6 9z" stroke="currentColor" stroke-width="1.5"/><circle cx="9" cy="7" r="2" stroke="currentColor" stroke-width="1.5"/></svg>
              ${labour.location}
            </span>
            ${hasRating ? `<span class="labour-card__rating">⭐ ${labour.rating}</span>` : ''}
          </div>
        </div>
        ${isApproved ? `
          <div class="labour-card__verified-badge" title="Aadhaar Verified Worker">
            <span>✅ Verified</span>
          </div>
        ` : ''}
      </div>

      <div class="labour-card__rate-badge">
        ₹${labour.cost} <small>/ day (दहाड़ी)</small>
      </div>

      ${hasExperience ? `<p class="labour-card__about">${labour.about}</p>` : ''}
    </div>

    <div class="labour-card__actions">
      <div class="labour-card__contact-row">
        <a href="tel:${labour.phone}" class="labour-card__btn labour-card__btn--call">
          📞 Call Direct
        </a>
        <a href="https://wa.me/${labour.phone.replace(/[^0-9]/g, '')}" class="labour-card__btn labour-card__btn--whatsapp" target="_blank">
          💬 WhatsApp
        </a>
      </div>
      <button class="button-v2 button-v2--primary labour-card__hire-btn" data-action="open-hire-modal" data-worker-id="${labour.id}">
        ⚡ Contact &amp; Hire Worker
      </button>
    </div>
  `;

  return card;
}

function showPhotoModal(photoSrc, name) {
  if (photoSrc && elements.modalPhoto && elements.photoModal) {
    elements.modalPhoto.src = photoSrc;
    elements.modalPhoto.alt = name;
    elements.photoModal.classList.remove('hidden');
  }
}

function updateStats() {
  const totalWorkers = state.workers.length;
  const totalSkills = new Set(state.workers.map(w => w.skill)).size;

  if (elements.workerCount) elements.workerCount.textContent = totalWorkers;
  if (elements.skillCount) elements.skillCount.textContent = totalSkills;
  if (elements.liveStatWorkers) elements.liveStatWorkers.textContent = totalWorkers;
}

function showToast(message, type = 'success') {
  if (!elements.toast) return;
  const icons = { success: '✅', error: '❌', info: 'ℹ️' };
  elements.toast.innerHTML = `<span class="toast__icon">${icons[type] || ''}</span><span>${message}</span>`;
  elements.toast.className = `toast toast--${type}`;
  elements.toast.classList.remove('hidden');

  clearTimeout(elements.toast._timeout);
  elements.toast._timeout = setTimeout(() => {
    elements.toast.classList.add('hidden');
  }, 3500);
}

function shakeElement(el) {
  if (!el) return;
  el.classList.add('shake');
  el.addEventListener('animationend', () => el.classList.remove('shake'), { once: true });
}

document.addEventListener('DOMContentLoaded', init);

// ------------------------------------------------------------
// LIVE LOCATION TRACKING SYSTEM
// ------------------------------------------------------------

async function fetchUserLocations() {
  if (!supabaseClient) return;

  try {
    const { data, error } = await supabaseClient
      .from('user_locations')
      .select('user_id, latitude, longitude, last_updated, online_status, role');

    if (error) {
      console.warn('[App] ⚠️ user_locations fetch error:', error.message);
      return;
    }

    state.locationCache = {};

    if (data) {
      data.forEach(loc => {
        if (loc.latitude && loc.longitude) {
          state.locationCache[loc.user_id] = {
            lat: loc.latitude,
            lng: loc.longitude,
            timestamp: loc.last_updated,
            online: loc.online_status,
            role: loc.role
          };
        }
      });
    }
  } catch (err) {
    console.error('[App] Fetch locations error:', err);
  }
}

function getTimeAgo(timestamp) {
  const now = new Date();
  const then = new Date(timestamp);
  const diffMs = now - then;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHrs = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHrs < 24) return `${diffHrs}h ago`;
  return `${diffDays}d ago`;
}

let locationMapInstance = null;

window.openLocationMap = function(userId, userName) {
  const locData = state.locationCache[userId];
  if (!locData || !locData.lat || !locData.lng) {
    showToast('📍 Location not available for this user', 'info');
    return;
  }

  const modal = document.getElementById('location-map-modal');
  const titleEl = document.getElementById('map-modal-title');
  const addressEl = document.getElementById('map-modal-address');
  const googleLink = document.getElementById('map-google-link');
  const directionsLink = document.getElementById('map-directions-link');

  if (titleEl) titleEl.textContent = `📍 ${userName}'s Live Location`;
  if (addressEl) addressEl.textContent = `Coordinates: ${locData.lat.toFixed(6)}, ${locData.lng.toFixed(6)}`;
  if (googleLink) googleLink.href = `https://www.google.com/maps?q=${locData.lat},${locData.lng}`;
  if (directionsLink) directionsLink.href = `https://www.google.com/maps/dir/?api=1&destination=${locData.lat},${locData.lng}`;

  modal.classList.remove('hidden');

  setTimeout(() => {
    const mapContainer = document.getElementById('location-map');
    if (locationMapInstance) {
      locationMapInstance.remove();
      locationMapInstance = null;
    }

    locationMapInstance = L.map(mapContainer).setView([locData.lat, locData.lng], 15);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors',
      maxZoom: 19
    }).addTo(locationMapInstance);

    const pulseIcon = L.divIcon({
      className: 'location-pulse-marker',
      html: `
        <div style="position: relative; width: 24px; height: 24px;">
          <div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 14px; height: 14px; background: #3b82f6; border: 3px solid #fff; border-radius: 50%; box-shadow: 0 0 12px rgba(59,130,246,0.6); z-index: 2;"></div>
          <div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 40px; height: 40px; background: rgba(59,130,246,0.2); border-radius: 50%; animation: locPulse 2s ease-out infinite;"></div>
        </div>
      `,
      iconSize: [40, 40],
      iconAnchor: [20, 20]
    });

    L.marker([locData.lat, locData.lng], { icon: pulseIcon })
      .addTo(locationMapInstance)
      .bindPopup(`<strong>${userName}</strong><br>📍 Last seen: ${locData.timestamp ? getTimeAgo(locData.timestamp) : 'Recently'}`)
      .openPopup();

    fetch(`https://nominatim.openstreetmap.org/reverse?lat=${locData.lat}&lon=${locData.lng}&format=json`)
      .then(r => r.json())
      .then(data => {
        if (data && data.display_name && addressEl) {
          addressEl.textContent = `📍 ${data.display_name}`;
        }
      })
      .catch(() => {});
  }, 200);
};

window.closeLocationModal = function() {
  const modal = document.getElementById('location-map-modal');
  if (modal) modal.classList.add('hidden');
  if (locationMapInstance) {
    locationMapInstance.remove();
    locationMapInstance = null;
  }
};

window.refreshAllLocations = async function() {
  showToast('🔄 Refreshing user locations...', 'info');
  await fetchUserLocations();
  renderAdminPanel();
  showToast('📍 Locations refreshed!', 'success');
};

let _adminLiveMapInitialized = false;

window.switchAdminTab = function(tab) {
  const overviewTab = document.getElementById('admin-overview-tab');
  const livemapTab = document.getElementById('admin-livemap-tab');
  const overviewBtn = document.getElementById('admin-tab-overview');
  const livemapBtn = document.getElementById('admin-tab-livemap');

  if (tab === 'overview') {
    if (overviewTab) overviewTab.classList.remove('hidden');
    if (livemapTab) livemapTab.classList.add('hidden');

    if (overviewBtn) {
      overviewBtn.classList.add('admin-tab-btn--active');
    }
    if (livemapBtn) {
      livemapBtn.classList.remove('admin-tab-btn--active');
    }
  } else if (tab === 'livemap') {
    if (overviewTab) overviewTab.classList.add('hidden');
    if (livemapTab) livemapTab.classList.remove('hidden');

    if (livemapBtn) {
      livemapBtn.classList.add('admin-tab-btn--active');
    }
    if (overviewBtn) {
      overviewBtn.classList.remove('admin-tab-btn--active');
    }

    if (!_adminLiveMapInitialized && typeof LiveMap !== 'undefined' && supabaseClient) {
      setTimeout(() => {
        LiveMap.init({
          supabase: supabaseClient,
          containerId: 'admin-live-map',
        });
        _adminLiveMapInitialized = true;
      }, 200);
    } else if (_adminLiveMapInitialized && typeof LiveMap !== 'undefined') {
      LiveMap.invalidateSize();
    }
  }
};

(function() {
  const style = document.createElement('style');
  style.textContent = `
    @keyframes locPulse {
      0% { transform: translate(-50%, -50%) scale(0.5); opacity: 1; }
      100% { transform: translate(-50%, -50%) scale(2.5); opacity: 0; }
    }
    .location-pulse-marker { background: none !important; border: none !important; }
    #location-map .leaflet-popup-content-wrapper {
      background: rgba(15, 23, 42, 0.95);
      color: #e2e8f0;
      border: 1px solid rgba(59, 130, 246, 0.3);
      border-radius: 10px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.4);
    }
    #location-map .leaflet-popup-tip { background: rgba(15, 23, 42, 0.95); }
  `;
  document.head.appendChild(style);
})();