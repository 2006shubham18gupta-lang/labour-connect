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
  populateSkillFilter();
  showView('home');

  // Load all live data from Supabase
  await refreshAllData();
}

async function refreshAllData() {
  if (!supabaseClient) {
    showToast("Supabase client failed to load", "error");
    return;
  }

  await Promise.all([
    fetchWorkers(),
    fetchBookings(),
    fetchAdminUsers()
  ]);

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
      rating: String(w.rating || '5.0'),
      photo: w.photo || '',
      aadhaar_number: w.aadhaar_number || '',
      verification_status: w.verification_status || 'pending',
    }));
  } catch (err) {
    console.error("Error fetching workers:", err);
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
// EVENT LISTENERS & NAVIGATION
// ------------------------------------------------------------

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

  if (elements.labourLoginForm) elements.labourLoginForm.addEventListener('submit', handleLabourLogin);
  if (elements.customerLoginForm) elements.customerLoginForm.addEventListener('submit', handleCustomerLogin);
  if (elements.labourRegisterForm) elements.labourRegisterForm.addEventListener('submit', handleLabourRegister);
  if (elements.customerRegisterForm) elements.customerRegisterForm.addEventListener('submit', handleCustomerRegister);
  if (elements.labourProfileForm) elements.labourProfileForm.addEventListener('submit', handleProfileUpdate);
  if (elements.hireWorkerForm) elements.hireWorkerForm.addEventListener('submit', handleHireSubmit);
  if (elements.adminSecretForm) elements.adminSecretForm.addEventListener('submit', handleAdminSecretSubmit);

  if (elements.labourSearch) elements.labourSearch.addEventListener('input', renderLabourList);
  if (elements.skillFilter) elements.skillFilter.addEventListener('change', renderLabourList);

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
  if (passcode === 'admin123' || passcode === 'admin' || passcode === 'shramik123') {
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
      break;
  }

  state.currentView = viewName;

  document.querySelectorAll('.nav-link').forEach(link => link.classList.remove('nav-link--active'));
  const activeAction = `show-${viewName}`;
  const activeNav = document.querySelector(`[data-action="${activeAction}"]`);
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
    // 1. Insert user with username fallback
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

    // 2. Insert worker profile
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

  // Attempt 1: With username column
  let { data: usersData, error } = await supabaseClient
    .from('users')
    .select('*')
    .or(`email.ilike.%${inputVal}%,username.ilike.%${inputVal}%,full_name.ilike.%${inputVal}%,phone.ilike.%${inputVal}%`)
    .eq('role', role);

  // Fallback 1: If username column does not exist in table
  if (error && error.message && (error.message.includes('username') || error.code === 'PGRST204')) {
    const fallback = await supabaseClient
      .from('users')
      .select('*')
      .or(`email.ilike.%${inputVal}%,full_name.ilike.%${inputVal}%,phone.ilike.%${inputVal}%`)
      .eq('role', role);
    usersData = fallback.data;
    error = fallback.error;
  }

  // Fallback 2: Select all users for role
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
    showLabourDashboard(worker);
    showToast(`Welcome back, ${worker.name}!`, 'success');
  } else {
    showToast('Worker account not found! Use your registered Username, Email, Name, or Phone.', 'error');
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
    showCustomerDashboard(customerUser);
    showToast(`Welcome back, ${customerUser.full_name}!`, 'success');
  } else {
    showToast('Customer account not found! Use your registered Username, Email, Name, or Phone.', 'error');
    shakeElement(e.target.closest('.login-page__card'));
  }
}

function logoutUser() {
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
  populateSkillFilter();
  updateStats();
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
    // 1. Update users table
    await supabaseClient
      .from('users')
      .update({ full_name: name, phone })
      .eq('id', workerId);

    // 2. Update worker_profiles table
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
    showToast('✅ Profile Details Updated in Supabase Database!', 'success');
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
      showToast('📷 Photo updated in Supabase Database!', 'success');
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
      showToast('Profile deleted permanently from Supabase', 'success');
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

  try {
    const { error } = await supabaseClient
      .from('bookings')
      .insert([{
        worker_id: state.selectedWorkerForHire.id,
        customer_id: customerId,
        daily_wage: state.selectedWorkerForHire.cost,
        booking_date: bookingDate,
        notes: `${title} | Location: ${location} | Notes: ${notes}`,
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
      ? `<span class="badge-approved">Accepted</span>`
      : req.status === 'rejected'
      ? `<span class="badge-rejected">Rejected</span>`
      : `<span class="badge-pending">Pending Request</span>`;

    card.innerHTML = `
      <div class="request-card__header">
        <h4 class="request-card__title">Direct Job Booking</h4>
        ${statusBadge}
      </div>
      <div><strong>Date:</strong> ${req.booking_date || 'Immediate'}</div>
      <div><strong>Details:</strong> ${req.notes || 'No extra notes provided'}</div>
      <div><strong>Daily Rate:</strong> ₹${req.daily_wage || 0}/day</div>
      ${req.status === 'pending' ? `
        <div class="request-card__actions">
          <button class="btn-accept" onclick="updateBookingStatus('${req.id}', 'accepted')">Accept Job ✓</button>
          <button class="btn-reject" onclick="updateBookingStatus('${req.id}', 'rejected')">Reject ✕</button>
        </div>
      ` : ''}
    `;
    elements.labourRequestsList.appendChild(card);
  });
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

  // Render Verification Table
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

  // Render Users Table
  if (elements.adminUsersList) {
    elements.adminUsersList.innerHTML = '';
    if (state.users.length === 0) {
      elements.adminUsersList.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--muted); padding: 20px;">No registered users found.</td></tr>`;
    } else {
      state.users.forEach(u => {
        const tr = document.createElement('tr');
        const regDate = u.created_at ? new Date(u.created_at).toLocaleDateString() : 'Recent';
        tr.innerHTML = `
          <td><strong>${u.full_name}</strong></td>
          <td>${u.email}</td>
          <td><span class="badge-approved">${u.role.toUpperCase()}</span></td>
          <td>${u.phone || '-'}</td>
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
      showToast('User account deleted from Supabase Database', 'success');
    } catch (err) {
      console.error("Delete user error:", err);
    }
  }
};

// ------------------------------------------------------------
// WORKER DIRECTORY CARDS & SHOWCASE RENDERING
// ------------------------------------------------------------

function filterBySkill(skill) {
  if (elements.skillFilter) elements.skillFilter.value = skill;
  showView('customer-dashboard');
  renderLabourList();
  showToast(`Filtered workers by: ${skill}`, 'info');
}

function populateSkillFilter() {
  const skills = [...new Set(state.workers.map(w => w.skill))].sort();
  if (!elements.skillFilter) return;

  elements.skillFilter.innerHTML = '<option value="all">All Trade Skills</option>';
  skills.forEach(skill => {
    const option = document.createElement('option');
    option.value = skill;
    option.textContent = skill;
    elements.skillFilter.appendChild(option);
  });
}

function renderHomeShowcase() {
  if (!elements.homeLabourShowcase) return;
  elements.homeLabourShowcase.innerHTML = '';

  const approvedWorkers = state.workers.filter(w => w.verification_status === 'approved' || state.workers.length <= 6).slice(0, 6);

  if (approvedWorkers.length === 0) {
    elements.homeLabourShowcase.innerHTML = `
      <div class="empty-state">
        <div class="empty-state__icon">👷</div>
        <h3>No verified workers available yet</h3>
        <p>Register as a skilled worker to be the first worker on Shramik Setu!</p>
      </div>
    `;
    return;
  }

  approvedWorkers.forEach((labour, index) => {
    const card = createLabourCard(labour, index);
    elements.homeLabourShowcase.appendChild(card);
  });
}

function renderLabourList() {
  if (!elements.labourList) return;
  const searchTerm = (elements.labourSearch ? elements.labourSearch.value : '').toLowerCase();
  const selectedSkill = elements.skillFilter ? elements.skillFilter.value : 'all';

  const filteredLabours = state.workers.filter(labour => {
    const matchesSearch = labour.name.toLowerCase().includes(searchTerm) ||
                         labour.skill.toLowerCase().includes(searchTerm) ||
                         labour.location.toLowerCase().includes(searchTerm);
    const matchesSkill = selectedSkill === 'all' || labour.skill === selectedSkill;
    return matchesSearch && matchesSkill;
  });

  elements.labourList.innerHTML = '';

  if (filteredLabours.length === 0) {
    elements.labourList.innerHTML = `
      <div class="empty-state">
        <div class="empty-state__icon">🔍</div>
        <h3>No skilled workers found</h3>
        <p>Try searching for a different trade skill or city location</p>
      </div>
    `;
    return;
  }

  filteredLabours.forEach((labour, index) => {
    const card = createLabourCard(labour, index);
    elements.labourList.appendChild(card);
  });
}

function createLabourCard(labour, index) {
  const card = document.createElement('div');
  card.className = 'labour-card';
  card.style.animationDelay = `${index * 0.05}s`;

  const photoSrc = labour.photo || '';
  const initials = labour.name.replace(/\(.*?\)/g, '').trim().split(' ').map(n => n[0]).slice(0, 2).join('');

  const skillIcons = {
    'Electrician': '⚡', 'Plumber': '🔧', 'Carpenter': '🪚', 'Mason': '🧱',
    'Painter': '🎨', 'Welder': '🔥', 'AC Repair': '❄️', 'Mechanic': '🔩',
    'Driver': '🚗', 'Gardener': '🌿', 'Cleaner': '🧹', 'Security Guard': '🛡️',
    'Construction Worker': '🏗️',
  };
  const skillIcon = skillIcons[labour.skill] || '👷';
  const rating = labour.rating || '5.0';

  card.innerHTML = `
    <div>
      <div class="labour-card__top">
        <div class="labour-card__avatar" onclick="showPhotoModal('${photoSrc.replace(/'/g, "\\'")}', '${labour.name.replace(/'/g, "\\'")}')">
          ${photoSrc ? `<img src="${photoSrc}" alt="${labour.name}" />` : `<span>${initials}</span>`}
        </div>
        <div>
          <div class="labour-card__name">${labour.name}</div>
          <div class="labour-card__skill">${skillIcon} ${labour.skill}</div>
          <div class="labour-card__meta">
            <span class="labour-card__location">
              <svg width="14" height="14" viewBox="0 0 18 18" fill="none"><path d="M9 16s-6-5.3-6-9a6 6 0 0112 0c0 3.7-6 9-6 9z" stroke="currentColor" stroke-width="1.5"/><circle cx="9" cy="7" r="2" stroke="currentColor" stroke-width="1.5"/></svg>
              ${labour.location}
            </span>
            <span class="labour-card__rating">⭐ ${rating}</span>
          </div>
        </div>
        <div class="labour-card__badge-icon" title="${labour.verification_status === 'approved' ? 'Aadhaar Verified Worker' : 'Verification Pending'}">
          ${labour.verification_status === 'approved' ? '✅' : '⏳'}
        </div>
      </div>

      <div class="labour-card__rate-badge">
        ₹${labour.cost} <small>/ day (दहाड़ी)</small>
      </div>

      <p class="labour-card__about">${labour.about || 'Experienced worker ready for immediate work.'}</p>
    </div>

    <div class="labour-card__actions" style="flex-direction: column; gap: 8px;">
      <div style="display: flex; gap: 8px; width: 100%;">
        <a href="tel:${labour.phone}" class="labour-card__btn labour-card__btn--call" style="flex: 1;">
          Call Direct
        </a>
        <a href="https://wa.me/${labour.phone.replace(/[^0-9]/g, '')}" class="labour-card__btn labour-card__btn--whatsapp" style="flex: 1;" target="_blank">
          WhatsApp
        </a>
      </div>
      <button class="button-v2 button-v2--primary" style="width: 100%; padding: 10px;" data-action="open-hire-modal" data-worker-id="${labour.id}">
        ⚡ Hire / Request Job
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