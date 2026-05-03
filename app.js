/* ═══════════════════════════════════════════
   HabitForge — app.js
   Full application logic with Supabase
═══════════════════════════════════════════ */

'use strict';

// ── State ──────────────────────────────────
let supabase = null;
let currentUser = null;
let userProfile = null;
let campaigns = [];
let checkins = [];
let rewards = [];
let profiles = [];

// ── Init ───────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  const savedUrl = localStorage.getItem('hf_url');
  const savedKey = localStorage.getItem('hf_key');

  if (savedUrl && savedKey) {
    document.getElementById('supabase-url').value = savedUrl;
    document.getElementById('supabase-key').value = savedKey;
    initSupabase(savedUrl, savedKey);
  } else {
    showScreen('setup-screen');
  }

  // Set today's date labels
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  document.getElementById('today-date').textContent = today;
  document.getElementById('checkin-date').textContent = today;

  // Custom days toggle
  document.getElementById('c-freq').addEventListener('change', (e) => {
    const cd = document.getElementById('custom-days');
    cd.classList.toggle('hidden', e.target.value !== 'custom');
  });

  // Day picker
  document.querySelectorAll('.day-btn').forEach(btn => {
    btn.addEventListener('click', () => btn.classList.toggle('selected'));
  });
});

// ── Supabase Connection ────────────────────
async function connectSupabase() {
  const url = document.getElementById('supabase-url').value.trim();
  const key = document.getElementById('supabase-key').value.trim();
  const errEl = document.getElementById('connect-error');
  errEl.classList.add('hidden');

  if (!url || !key) {
    showError('connect-error', 'Please enter both your Supabase URL and Anon Key.');
    return;
  }

  try {
    localStorage.setItem('hf_url', url);
    localStorage.setItem('hf_key', key);
    await initSupabase(url, key);
  } catch (e) {
    showError('connect-error', 'Connection failed: ' + e.message);
  }
}

async function initSupabase(url, key) {
  try {
    supabase = window.supabase.createClient(url, key);

    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
      currentUser = session.user;
      await loadUserProfile();
      await showApp();
    } else {
      showScreen('auth-screen');
    }

    // Auth state change
    supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN') {
        currentUser = session.user;
        await loadUserProfile();
        await showApp();
      } else if (event === 'SIGNED_OUT') {
        currentUser = null;
        userProfile = null;
        showScreen('auth-screen');
      }
    });
  } catch (e) {
    showScreen('setup-screen');
    showError('connect-error', 'Failed to connect: ' + e.message);
  }
}

// ── Auth ───────────────────────────────────
function switchTab(tab) {
  document.querySelectorAll('.auth-tab').forEach((t, i) => {
    t.classList.toggle('active', (i === 0 && tab === 'login') || (i === 1 && tab === 'signup'));
  });
  document.getElementById('login-form').classList.toggle('hidden', tab !== 'login');
  document.getElementById('signup-form').classList.toggle('hidden', tab !== 'signup');
}

async function signIn() {
  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  document.getElementById('auth-error').classList.add('hidden');

  if (!email || !password) { showError('auth-error', 'Please fill in all fields.'); return; }

  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) showError('auth-error', error.message);
}

async function signUp() {
  const name = document.getElementById('signup-name').value.trim();
  const email = document.getElementById('signup-email').value.trim();
  const password = document.getElementById('signup-password').value;
  document.getElementById('auth-error').classList.add('hidden');

  if (!name || !email || !password) { showError('auth-error', 'Please fill in all fields.'); return; }
  if (password.length < 6) { showError('auth-error', 'Password must be at least 6 characters.'); return; }

  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) { showError('auth-error', error.message); return; }

  if (data.user) {
    // Create profile
    await supabase.from('profiles').insert({
      id: data.user.id,
      display_name: name,
      total_points: 0
    });
    showToast('Account created! Check your email to confirm.', 'success');
  }
}

async function signOut() {
  await supabase.auth.signOut();
}

// ── Profile ────────────────────────────────
async function loadUserProfile() {
  const { data } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', currentUser.id)
    .single();

  if (data) {
    userProfile = data;
  } else {
    // Create profile if missing
    const name = currentUser.email.split('@')[0];
    const { data: newProfile } = await supabase
      .from('profiles')
      .insert({ id: currentUser.id, display_name: name, total_points: 0 })
      .select().single();
    userProfile = newProfile;
  }

  updateUserUI();
}

function updateUserUI() {
  if (!userProfile) return;
  const name = userProfile.display_name || 'User';
  document.getElementById('user-name').textContent = name;
  document.getElementById('user-avatar').textContent = name.charAt(0).toUpperCase();
  document.getElementById('user-points').textContent = (userProfile.total_points || 0).toLocaleString();
}

// ── App ────────────────────────────────────
async function showApp() {
  showScreen('app-screen');
  await Promise.all([loadCampaigns(), loadCheckins(), loadRewards()]);
  renderDashboard();
  renderCampaigns();
  renderCheckin();
  renderRewards();
  loadLeaderboard();
}

// ── Data Loading ───────────────────────────
async function loadCampaigns() {
  const { data } = await supabase
    .from('campaigns')
    .select('*')
    .eq('user_id', currentUser.id)
    .order('created_at', { ascending: false });
  campaigns = data || [];
}

async function loadCheckins() {
  const { data } = await supabase
    .from('checkins')
    .select('*')
    .eq('user_id', currentUser.id)
    .order('checked_date', { ascending: false });
  checkins = data || [];
}

async function loadRewards() {
  const { data } = await supabase
    .from('rewards')
    .select(`*, user_rewards(id, earned_at)`)
    .eq('user_id', currentUser.id);
  rewards = data || [];
}

// ── Dashboard ──────────────────────────────
function renderDashboard() {
  const today = todayStr();
  const activeCampaigns = campaigns.filter(c => c.is_active);
  const todayCheckins = checkins.filter(c => c.checked_date === today);

  // Stats
  document.getElementById('stat-active').textContent = activeCampaigns.length;
  document.getElementById('stat-points').textContent = (userProfile?.total_points || 0).toLocaleString();
  document.getElementById('stat-checkins').textContent = checkins.length;

  // Best streak across all campaigns
  let bestStreak = 0;
  activeCampaigns.forEach(c => {
    const s = calcStreak(c.id);
    if (s > bestStreak) bestStreak = s;
  });
  document.getElementById('stat-streak').textContent = bestStreak + ' 🔥';

  // Today's habits
  const container = document.getElementById('todays-habits');
  if (activeCampaigns.length === 0) {
    container.innerHTML = `<div class="empty-state" style="grid-column:1/-1">
      <span class="empty-icon">🌱</span>
      <p>No active campaigns yet.<br>Create your first one in <strong>Campaigns</strong>!</p>
    </div>`;
    return;
  }

  const todayDue = activeCampaigns.filter(c => isDueToday(c));
  container.innerHTML = todayDue.map(c => {
    const streak = calcStreak(c.id);
    const checked = todayCheckins.some(ci => ci.campaign_id === c.id);
    return `<div class="habit-card ${checked ? 'checked' : ''}">
      <div class="habit-emoji">${c.emoji || '📌'}</div>
      <div class="habit-name">${esc(c.name)}</div>
      <div class="habit-streak">🔥 ${streak} day streak</div>
      <div class="habit-pts">+${c.points_per_checkin} pts per check-in</div>
      <div class="habit-check">
        <button class="check-btn ${checked ? 'done' : ''}" onclick="doCheckin('${c.id}')" ${checked ? 'disabled' : ''}>
          ${checked ? '✓ Done today' : 'Check in'}
        </button>
      </div>
    </div>`;
  }).join('');

  // Activity feed
  const feed = document.getElementById('activity-feed');
  const recent = checkins.slice(0, 8);
  if (recent.length === 0) {
    feed.innerHTML = `<div class="empty-state"><p>No activity yet. Start checking in!</p></div>`;
    return;
  }
  feed.innerHTML = recent.map(ci => {
    const camp = campaigns.find(c => c.id === ci.campaign_id);
    return `<div class="activity-item">
      <span class="activity-icon">${camp?.emoji || '📌'}</span>
      <span class="activity-text">Checked in: <strong>${esc(camp?.name || 'Unknown')}</strong></span>
      <span class="activity-time">${ci.checked_date}</span>
    </div>`;
  }).join('');
}

// ── Campaigns ─────────────────────────────
function renderCampaigns() {
  const container = document.getElementById('campaigns-list');
  if (campaigns.length === 0) {
    container.innerHTML = `<div class="empty-state" style="grid-column:1/-1">
      <span class="empty-icon">🚀</span>
      <p>No campaigns yet. Create your first habit campaign!</p>
    </div>`;
    return;
  }

  container.innerHTML = campaigns.map(c => {
    const streak = calcStreak(c.id);
    const total = checkins.filter(ci => ci.campaign_id === c.id).length;
    const status = c.is_active ? 'active' : 'ended';
    const progress = c.end_date ? calcProgress(c) : null;
    const freqLabel = { daily: 'Every day', weekdays: 'Weekdays', weekends: 'Weekends', custom: 'Custom' }[c.frequency] || c.frequency;

    return `<div class="campaign-card">
      <div class="campaign-header">
        <div class="campaign-emoji">${c.emoji || '📌'}</div>
        <div class="campaign-status ${status}">${status}</div>
      </div>
      <div class="campaign-name">${esc(c.name)}</div>
      <div class="campaign-desc">${esc(c.description || '')}</div>
      ${progress !== null ? `<div class="progress-bar"><div class="progress-fill" style="width:${progress}%"></div></div>` : ''}
      <div class="campaign-meta">
        <div class="meta-item"><div class="meta-label">Streak</div><div class="meta-value">🔥 ${streak} days</div></div>
        <div class="meta-item"><div class="meta-label">Check-ins</div><div class="meta-value">${total}</div></div>
        <div class="meta-item"><div class="meta-label">Pts / day</div><div class="meta-value">${c.points_per_checkin}</div></div>
        <div class="meta-item"><div class="meta-label">Frequency</div><div class="meta-value">${freqLabel}</div></div>
      </div>
      <div class="campaign-actions">
        ${c.is_active
          ? `<button class="btn-danger" onclick="archiveCampaign('${c.id}')">Archive</button>`
          : `<button class="btn-ghost" onclick="reactivateCampaign('${c.id}')">Reactivate</button>`}
        <button class="btn-danger" onclick="deleteCampaign('${c.id}')">Delete</button>
      </div>
    </div>`;
  }).join('');
}

async function createCampaign() {
  const name = document.getElementById('c-name').value.trim();
  const desc = document.getElementById('c-desc').value.trim();
  const start = document.getElementById('c-start').value || todayStr();
  const end = document.getElementById('c-end').value || null;
  const points = parseInt(document.getElementById('c-points').value) || 10;
  const emoji = document.getElementById('c-emoji').value.trim() || '📌';
  const freq = document.getElementById('c-freq').value;

  if (!name) { showToast('Please enter a campaign name.', 'error'); return; }

  let customDays = null;
  if (freq === 'custom') {
    customDays = Array.from(document.querySelectorAll('.day-btn.selected'))
      .map(b => parseInt(b.dataset.day));
    if (customDays.length === 0) { showToast('Select at least one day.', 'error'); return; }
  }

  const { data, error } = await supabase.from('campaigns').insert({
    user_id: currentUser.id,
    name, description: desc, start_date: start, end_date: end,
    points_per_checkin: points, emoji, frequency: freq,
    custom_days: customDays, is_active: true
  }).select().single();

  if (error) { showToast(error.message, 'error'); return; }

  campaigns.unshift(data);
  closeModal('campaign-modal');
  clearCampaignForm();
  renderCampaigns();
  renderDashboard();
  renderCheckin();
  showToast(`Campaign "${name}" created!`, 'success');
}

function clearCampaignForm() {
  ['c-name','c-desc','c-start','c-end','c-emoji'].forEach(id => { document.getElementById(id).value = ''; });
  document.getElementById('c-points').value = '10';
  document.getElementById('c-freq').value = 'daily';
  document.getElementById('custom-days').classList.add('hidden');
  document.querySelectorAll('.day-btn').forEach(b => b.classList.remove('selected'));
}

async function archiveCampaign(id) {
  await supabase.from('campaigns').update({ is_active: false }).eq('id', id);
  const c = campaigns.find(c => c.id === id);
  if (c) c.is_active = false;
  renderCampaigns(); renderDashboard(); renderCheckin();
  showToast('Campaign archived.', 'info');
}

async function reactivateCampaign(id) {
  await supabase.from('campaigns').update({ is_active: true }).eq('id', id);
  const c = campaigns.find(c => c.id === id);
  if (c) c.is_active = true;
  renderCampaigns(); renderDashboard(); renderCheckin();
  showToast('Campaign reactivated!', 'success');
}

async function deleteCampaign(id) {
  if (!confirm('Delete this campaign and all its check-ins? This cannot be undone.')) return;
  await supabase.from('checkins').delete().eq('campaign_id', id);
  await supabase.from('campaigns').delete().eq('id', id);
  campaigns = campaigns.filter(c => c.id !== id);
  checkins = checkins.filter(ci => ci.campaign_id !== id);
  renderCampaigns(); renderDashboard(); renderCheckin();
  showToast('Campaign deleted.', 'info');
}

// ── Check-in ───────────────────────────────
function renderCheckin() {
  const container = document.getElementById('checkin-list');
  const today = todayStr();
  const activeCampaigns = campaigns.filter(c => c.is_active && isDueToday(c));

  if (activeCampaigns.length === 0) {
    container.innerHTML = `<div class="empty-state">
      <span class="empty-icon">😴</span>
      <p>No habits due today, or no active campaigns. Go rest!</p>
    </div>`;
    return;
  }

  container.innerHTML = activeCampaigns.map(c => {
    const streak = calcStreak(c.id);
    const checked = checkins.some(ci => ci.campaign_id === c.id && ci.checked_date === today);
    return `<div class="checkin-item ${checked ? 'done' : ''}">
      <div class="checkin-emoji">${c.emoji || '📌'}</div>
      <div class="checkin-info">
        <div class="checkin-name">${esc(c.name)}</div>
        <div class="checkin-streak">🔥 ${streak} day streak</div>
        <div class="checkin-pts">+${c.points_per_checkin} pts</div>
      </div>
      <div class="checkin-action">
        ${checked
          ? `<button class="checkin-btn done-btn">✓ Done</button>`
          : `<button class="checkin-btn" onclick="doCheckin('${c.id}')">Check In</button>`}
      </div>
    </div>`;
  }).join('');
}

async function doCheckin(campaignId) {
  const today = todayStr();
  const alreadyDone = checkins.some(ci => ci.campaign_id === campaignId && ci.checked_date === today);
  if (alreadyDone) { showToast('Already checked in today!', 'info'); return; }

  const campaign = campaigns.find(c => c.id === campaignId);
  if (!campaign) return;

  const { data, error } = await supabase.from('checkins').insert({
    user_id: currentUser.id, campaign_id: campaignId, checked_date: today
  }).select().single();

  if (error) { showToast(error.message, 'error'); return; }

  checkins.unshift(data);

  // Award points
  const newPoints = (userProfile.total_points || 0) + campaign.points_per_checkin;
  await supabase.from('profiles').update({ total_points: newPoints }).eq('id', currentUser.id);
  userProfile.total_points = newPoints;
  document.getElementById('user-points').textContent = newPoints.toLocaleString();
  document.getElementById('stat-points').textContent = newPoints.toLocaleString();

  renderDashboard();
  renderCheckin();
  showToast(`✓ Checked in! +${campaign.points_per_checkin} pts`, 'success');

  // Check reward milestones
  await checkRewardMilestones(campaignId);
}

// ── Rewards ────────────────────────────────
function renderRewards() {
  const container = document.getElementById('rewards-list');
  // Populate campaign select
  const sel = document.getElementById('r-campaign');
  sel.innerHTML = '<option value="">Any campaign</option>' +
    campaigns.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('');

  if (rewards.length === 0) {
    container.innerHTML = `<div class="empty-state" style="grid-column:1/-1">
      <span class="empty-icon">🏆</span>
      <p>No rewards yet. Create milestones to earn bonus points!</p>
    </div>`;
    return;
  }

  container.innerHTML = rewards.map(r => {
    const earned = r.user_rewards && r.user_rewards.length > 0;
    const triggerLabel = {
      streak: `${r.trigger_value}-day streak`,
      total: `${r.trigger_value} total check-ins`,
      points: `${r.trigger_value} total points`
    }[r.trigger_type];
    const camp = campaigns.find(c => c.id === r.campaign_id);
    return `<div class="reward-card ${earned ? 'unlocked' : ''}">
      <div class="reward-emoji">${r.emoji || '🏆'}</div>
      <div class="reward-name">${esc(r.name)}</div>
      <div class="reward-desc">${esc(r.description || '')}</div>
      <div class="reward-meta">
        <span class="reward-tag streak">🎯 ${triggerLabel}</span>
        <span class="reward-tag bonus">+${r.bonus_points} pts</span>
        ${r.is_repeatable ? '<span class="reward-tag">🔁 Repeating</span>' : ''}
        ${camp ? `<span class="reward-tag">📌 ${esc(camp.name)}</span>` : ''}
      </div>
      ${earned ? `<div class="reward-unlocked-badge">✓ Unlocked ${new Date(r.user_rewards[0].earned_at).toLocaleDateString()}</div>` : ''}
    </div>`;
  }).join('');
}

async function createReward() {
  const name = document.getElementById('r-name').value.trim();
  const desc = document.getElementById('r-desc').value.trim();
  const campaignId = document.getElementById('r-campaign').value || null;
  const triggerType = document.getElementById('r-trigger-type').value;
  const triggerValue = parseInt(document.getElementById('r-trigger-value').value) || 7;
  const bonus = parseInt(document.getElementById('r-bonus').value) || 50;
  const emoji = document.getElementById('r-emoji').value.trim() || '🏆';
  const repeatable = document.getElementById('r-repeat').value === 'true';

  if (!name) { showToast('Please enter a reward name.', 'error'); return; }

  const { data, error } = await supabase.from('rewards').insert({
    user_id: currentUser.id, name, description: desc, campaign_id: campaignId,
    trigger_type: triggerType, trigger_value: triggerValue,
    bonus_points: bonus, emoji, is_repeatable: repeatable
  }).select(`*, user_rewards(id, earned_at)`).single();

  if (error) { showToast(error.message, 'error'); return; }

  rewards.push(data);
  closeModal('reward-modal');
  renderRewards();
  showToast(`Reward "${name}" created!`, 'success');
}

async function checkRewardMilestones(campaignId) {
  const streak = calcStreak(campaignId);
  const totalCheckins = checkins.filter(ci => ci.campaign_id === campaignId).length;
  const totalPoints = userProfile.total_points;

  for (const reward of rewards) {
    if (reward.campaign_id && reward.campaign_id !== campaignId) continue;

    const alreadyEarned = reward.user_rewards && reward.user_rewards.length > 0;
    if (alreadyEarned && !reward.is_repeatable) continue;

    let met = false;
    if (reward.trigger_type === 'streak' && streak >= reward.trigger_value) met = true;
    if (reward.trigger_type === 'total' && totalCheckins >= reward.trigger_value) met = true;
    if (reward.trigger_type === 'points' && totalPoints >= reward.trigger_value) met = true;

    if (met) {
      // Check if already earned (more precise)
      const { data: existing } = await supabase
        .from('user_rewards')
        .select('id')
        .eq('user_id', currentUser.id)
        .eq('reward_id', reward.id);

      if (existing && existing.length > 0 && !reward.is_repeatable) continue;

      await supabase.from('user_rewards').insert({
        user_id: currentUser.id, reward_id: reward.id
      });

      // Award bonus
      if (reward.bonus_points > 0) {
        const newPts = (userProfile.total_points || 0) + reward.bonus_points;
        await supabase.from('profiles').update({ total_points: newPts }).eq('id', currentUser.id);
        userProfile.total_points = newPts;
        document.getElementById('user-points').textContent = newPts.toLocaleString();
      }

      showToast(`🎉 Reward unlocked: "${reward.name}"! +${reward.bonus_points} pts`, 'success');
      await loadRewards();
      renderRewards();
      break;
    }
  }
}

// ── Leaderboard ────────────────────────────
async function loadLeaderboard() {
  const { data } = await supabase
    .from('profiles')
    .select('*')
    .order('total_points', { ascending: false })
    .limit(20);

  profiles = data || [];
  renderLeaderboard();
}

function renderLeaderboard() {
  const container = document.getElementById('leaderboard-list');
  if (profiles.length === 0) {
    container.innerHTML = `<div class="empty-state"><span class="empty-icon">🏅</span><p>No players yet!</p></div>`;
    return;
  }

  container.innerHTML = profiles.map((p, i) => {
    const rank = i + 1;
    const isMe = p.id === currentUser.id;
    const rankClass = rank === 1 ? 'gold' : rank === 2 ? 'silver' : rank === 3 ? 'bronze' : '';
    const rankIcon = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : rank;
    const userCheckins = checkins.filter(ci => ci.user_id === p.id);

    return `<div class="lb-item ${isMe ? 'me' : ''}">
      <div class="lb-rank ${rankClass}">${rankIcon}</div>
      <div class="lb-avatar">${(p.display_name || 'U').charAt(0).toUpperCase()}</div>
      <div class="lb-name">${esc(p.display_name || 'Anonymous')}${isMe ? ' (you)' : ''}</div>
      <div class="lb-stats">
        <div class="lb-stat">
          <div class="lb-stat-val" style="color:var(--accent)">${(p.total_points || 0).toLocaleString()}</div>
          <div class="lb-stat-lbl">Points</div>
        </div>
      </div>
    </div>`;
  }).join('');
}

// ── View Switching ─────────────────────────
function switchView(view) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById(`view-${view}`).classList.add('active');
  document.querySelector(`[data-view="${view}"]`).classList.add('active');

  if (view === 'leaderboard') loadLeaderboard();
  if (view === 'checkin') renderCheckin();
}

// ── Modal ──────────────────────────────────
function openModal(id) {
  document.getElementById(id).classList.remove('hidden');
  document.body.style.overflow = 'hidden';
  // Populate campaign select in reward modal
  if (id === 'reward-modal') {
    const sel = document.getElementById('r-campaign');
    sel.innerHTML = '<option value="">Any campaign</option>' +
      campaigns.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('');
  }
}
function closeModal(id) {
  document.getElementById(id).classList.add('hidden');
  document.body.style.overflow = '';
}
function closeModalOutside(e, id) {
  if (e.target === document.getElementById(id)) closeModal(id);
}

// ── Helpers ────────────────────────────────
function todayStr() {
  return new Date().toISOString().split('T')[0];
}

function isDueToday(campaign) {
  if (!campaign.is_active) return false;
  const today = new Date();
  const dayOfWeek = today.getDay(); // 0=Sun

  if (campaign.start_date && campaign.start_date > todayStr()) return false;
  if (campaign.end_date && campaign.end_date < todayStr()) return false;

  switch (campaign.frequency) {
    case 'daily': return true;
    case 'weekdays': return dayOfWeek >= 1 && dayOfWeek <= 5;
    case 'weekends': return dayOfWeek === 0 || dayOfWeek === 6;
    case 'custom':
      return campaign.custom_days && campaign.custom_days.includes(dayOfWeek);
    default: return true;
  }
}

function calcStreak(campaignId) {
  const campCheckins = checkins
    .filter(ci => ci.campaign_id === campaignId)
    .map(ci => ci.checked_date)
    .sort((a, b) => b.localeCompare(a)); // newest first

  if (campCheckins.length === 0) return 0;

  const today = todayStr();
  const yesterday = offsetDate(-1);
  const campaign = campaigns.find(c => c.id === campaignId);

  let streak = 0;
  let cursor = today;

  // Start from today or yesterday
  if (!campCheckins.includes(today) && !campCheckins.includes(yesterday)) return 0;
  if (!campCheckins.includes(today)) cursor = yesterday;

  while (true) {
    if (!campCheckins.includes(cursor)) {
      // Skip non-due days for non-daily habits
      if (campaign && campaign.frequency !== 'daily') {
        cursor = offsetDate(-1, cursor);
        // Safety
        if (cursor < offsetDate(-365)) break;
        continue;
      }
      break;
    }
    streak++;
    cursor = offsetDate(-1, cursor);
    if (cursor < offsetDate(-365)) break;
  }
  return streak;
}

function offsetDate(days, fromStr = null) {
  const d = fromStr ? new Date(fromStr) : new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

function calcProgress(campaign) {
  if (!campaign.start_date || !campaign.end_date) return 0;
  const start = new Date(campaign.start_date).getTime();
  const end = new Date(campaign.end_date).getTime();
  const now = Date.now();
  return Math.min(100, Math.max(0, Math.round((now - start) / (end - start) * 100)));
}

function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

function showError(elementId, msg) {
  const el = document.getElementById(elementId);
  el.textContent = msg;
  el.classList.remove('hidden');
}

function showToast(msg, type = 'info') {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.className = `toast ${type}`;
  toast.classList.remove('hidden');
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => toast.classList.add('hidden'), 3500);
}

function esc(str) {
  if (!str) return '';
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
