/* =============================================
   NBA 实时数据 - 主应用逻辑
   ============================================= */

// ===== 配置 =====
const API = {
    base: 'https://balldontlie.io/api/v1',
    season: 2025,  // 2025-26 season
};

// ===== 球队中文名映射 =====
const TEAM_CN = {
    1: '老鹰', 2: '凯尔特人', 3: '篮网', 4: '黄蜂', 5: '公牛',
    6: '骑士', 7: '独行侠', 8: '掘金', 9: '活塞', 10: '勇士',
    11: '火箭', 12: '步行者', 13: '快船', 14: '湖人', 15: '灰熊',
    16: '热火', 17: '雄鹿', 18: '森林狼', 19: '鹈鹕', 20: '尼克斯',
    21: '雷霆', 22: '魔术', 23: '76人', 24: '太阳', 25: '开拓者',
    26: '国王', 27: '马刺', 28: '猛龙', 29: '爵士', 30: '奇才',
};

// ===== 状态 =====
let state = {
    teams: [],
    currentDate: '',
    selectedPlayerId: null,
    refreshTimer: null,
};

// ===== DOM 引用 =====
const $ = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];

const el = {};
function cacheDOM() {
    el.tabNav = $('#tabNav');
    el.tabs = $$('.tab-btn');
    el.tabContents = {
        games: $('#tab-games'),
        players: $('#tab-players'),
        standings: $('#tab-standings'),
    };
    el.gamesContainer = $('#gamesContainer');
    el.displayDate = $('#displayDate');
    el.headerDate = $('#headerDate');
    el.prevDateBtn = $('#prevDateBtn');
    el.nextDateBtn = $('#nextDateBtn');
    el.todayBtn = $('#todayBtn');
    el.liveBadge = $('#liveBadge');
    el.playerSearch = $('#playerSearchInput');
    el.searchBtn = $('#searchBtn');
    el.playerResults = $('#playerResults');
    el.playerStatsContainer = $('#playerStatsContainer');
    el.standingsContainer = $('#standingsContainer');
    el.hotTags = $$('.hot-tag');
}

// ===== 工具函数 =====
function getChinaDate(offset = 0) {
    const now = new Date();
    const utc = now.getTime() + now.getTimezoneOffset() * 60000;
    const china = new Date(utc + 8 * 3600000);
    china.setDate(china.getDate() + offset);
    return china;
}

function formatDateKey(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

function formatDisplayDate(date) {
    const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
    const m = date.getMonth() + 1;
    const d = date.getDate();
    const w = weekdays[date.getDay()];
    return `${m}月${d}日 星期${w}`;
}

function formatHeaderDate(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
    const w = weekdays[date.getDay()];
    return `${y}年${m}月${d}日 周${w}`;
}

function getTeamName(teamId) {
    const team = state.teams.find(t => t.id === teamId);
    return team ? team.full_name : `Team #${teamId}`;
}

function getTeamCn(teamId) {
    return TEAM_CN[teamId] || '';
}

function getTeamAbbr(teamId) {
    const team = state.teams.find(t => t.id === teamId);
    return team ? team.abbreviation : '';
}

function getTeamLogo(id) {
    const abbr = getTeamAbbr(id);
    if (!abbr) return '';
    return `https://a.espncdn.com/combiner/i?img=/i/teamlogos/nba/500/${abbr}.png&h=40&w=40`;
}

function formatTimeUTC(isoStr) {
    if (!isoStr) return '';
    const d = new Date(isoStr);
    const utc = d.getTime() + d.getTimezoneOffset() * 60000;
    const china = new Date(utc + 8 * 3600000);
    const h = String(china.getHours()).padStart(2, '0');
    const m = String(china.getMinutes()).padStart(2, '0');
    return `${h}:${m}`;
}

function debounce(fn, ms = 300) {
    let timer;
    return (...args) => {
        clearTimeout(timer);
        timer = setTimeout(() => fn(...args), ms);
    };
}

// ===== API 调用 =====
async function fetchAPI(endpoint, params = {}) {
    const qs = Object.entries(params)
        .map(([k, v]) => {
            if (Array.isArray(v)) return v.map(x => `${k}[]=${encodeURIComponent(x)}`).join('&');
            return `${k}=${encodeURIComponent(v)}`;
        })
        .join('&');
    const url = `${API.base}${endpoint}${qs ? '?' + qs : ''}`;

    const res = await fetch(url, {
        headers: { 'Accept': 'application/json' },
    });

    if (!res.ok) {
        throw new Error(`API error: ${res.status} ${res.statusText}`);
    }
    return res.json();
}

// ===== 加载球队数据 =====
async function loadTeams() {
    try {
        const data = await fetchAPI('/teams');
        state.teams = data.data;
    } catch (err) {
        console.error('Failed to load teams:', err);
    }
}

// ===== 标签切换 =====
function setupTabs() {
    el.tabs.forEach(btn => {
        btn.addEventListener('click', () => {
            const tab = btn.dataset.tab;
            switchTab(tab);
        });
    });
}

function switchTab(tab) {
    el.tabs.forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
    Object.entries(el.tabContents).forEach(([key, section]) => {
        section.classList.toggle('active', key === tab);
    });

    if (tab === 'games') loadGames();
    else if (tab === 'standings') loadStandings();
}

// ==========================================
// 今日赛程
// ==========================================
async function loadGames() {
    const dateKey = formatDateKey(state.currentDate);
    el.gamesContainer.innerHTML = `<div class="loading-state"><div class="spinner"></div><p>正在加载赛程数据...</p></div>`;

    try {
        const data = await fetchAPI('/games', {
            'dates[]': dateKey,
            per_page: 30,
        });
        renderGames(data.data);
    } catch (err) {
        el.gamesContainer.innerHTML = `
            <div class="error-state">
                <div class="error-icon">⚠️</div>
                <p>加载赛程数据失败: ${err.message}</p>
                <button class="retry-btn" onclick="loadGames()">重新加载</button>
            </div>`;
    }
}

function renderGames(games) {
    if (!games || games.length === 0) {
        el.gamesContainer.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">📅</div>
                <p>该日期暂无比赛安排</p>
                <p style="font-size:0.8rem;color:var(--text-muted);margin-top:8px;">NBA 休赛期或暂无赛程数据</p>
            </div>`;
        return;
    }

    // Sort: live first, then by time
    const sorted = [...games].sort((a, b) => {
        const aLive = a.status === 'In Progress' ? 0 : 1;
        const bLive = b.status === 'In Progress' ? 0 : 1;
        if (aLive !== bLive) return aLive - bLive;
        return a.id - b.id;
    });

    const hasLive = sorted.some(g => g.status === 'In Progress');
    el.liveBadge.style.display = hasLive ? 'inline' : 'none';

    el.gamesContainer.innerHTML = sorted.map(game => renderGameCard(game)).join('');

    // Auto-refresh if any game is live
    if (hasLive) {
        startAutoRefresh();
    }
}

function renderGameCard(game) {
    const { home_team, visitor_team, home_team_score, visitor_team_score, status, period, time } = game;
    const isLive = status === 'In Progress';
    const isFinal = status === 'Final';
    const isScheduled = status === 'Scheduled' || (!isLive && !isFinal);

    const hScore = home_team_score ?? '-';
    const vScore = visitor_team_score ?? '-';
    const hWin = isFinal && home_team_score > visitor_team_score;
    const vWin = isFinal && visitor_team_score > home_team_score;

    let statusBadge = '';
    let statusTime = '';

    if (isFinal) {
        statusBadge = `<span class="game-status-badge final">已结束</span>`;
    } else if (isLive) {
        const qText = period > 4 ? `加时${period - 4}` : `第${period}节`;
        statusBadge = `<span class="game-status-badge live">▶ ${qText}</span>`;
        statusTime = time ? `<div class="game-status-time">${time}</div>` : '';
    } else {
        statusBadge = `<span class="game-status-badge scheduled">未开始</span>`;
        statusTime = `<div class="game-status-time">${formatTimeUTC(game.date)} 开赛</div>`;
    }

    return `
    <div class="game-card${isLive ? ' live' : ''}">
        <div class="game-team visitor">
            <div>
                <div class="game-team-name">${getTeamName(visitor_team.id)}</div>
                <span class="game-team-name-cn">${getTeamCn(visitor_team.id)}</span>
            </div>
            <img class="game-team-logo" src="${getTeamLogo(visitor_team.id)}" alt="${visitor_team.abbreviation}" loading="lazy" onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 40 40%22><rect fill=%22%231a2035%22 width=%2240%22 height=%2240%22 rx=%228%22/><text x=%2220%22 y=%2226%22 text-anchor=%22middle%22 font-size=%2216%22 fill=%22%2394a3b8%22>${visitor_team.abbreviation}</text></svg>'">
        </div>
        <div class="game-score-section">
            <span class="game-score ${vWin ? 'winner' : ''}">${vScore}</span>
            <span class="game-score-divider">:</span>
            <span class="game-score ${hWin ? 'winner' : ''}">${hScore}</span>
        </div>
        <div class="game-team home">
            <img class="game-team-logo" src="${getTeamLogo(home_team.id)}" alt="${home_team.abbreviation}" loading="lazy" onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 40 40%22><rect fill=%22%231a2035%22 width=%2240%22 height=%2240%22 rx=%228%22/><text x=%2220%22 y=%2226%22 text-anchor=%22middle%22 font-size=%2216%22 fill=%22%2394a3b8%22>${home_team.abbreviation}</text></svg>'">
            <div>
                <div class="game-team-name">${getTeamName(home_team.id)}</div>
                <span class="game-team-name-cn">${getTeamCn(home_team.id)}</span>
            </div>
        </div>
        <div class="game-status">
            ${statusBadge}
            ${statusTime}
        </div>
    </div>`;
}

function startAutoRefresh() {
    if (state.refreshTimer) clearInterval(state.refreshTimer);
    state.refreshTimer = setInterval(() => {
        const activeTab = $('.tab-btn.active');
        if (activeTab && activeTab.dataset.tab === 'games') {
            loadGames();
        }
    }, 30000); // refresh every 30s
}

function setupDateNav() {
    state.currentDate = getChinaDate();
    updateDateDisplay();

    el.prevDateBtn.addEventListener('click', () => {
        state.currentDate.setDate(state.currentDate.getDate() - 1);
        updateDateDisplay();
        loadGames();
    });

    el.nextDateBtn.addEventListener('click', () => {
        state.currentDate.setDate(state.currentDate.getDate() + 1);
        updateDateDisplay();
        loadGames();
    });

    el.todayBtn.addEventListener('click', () => {
        state.currentDate = getChinaDate();
        updateDateDisplay();
        loadGames();
    });
}

function updateDateDisplay() {
    el.displayDate.textContent = formatDisplayDate(state.currentDate);
    el.headerDate.textContent = formatHeaderDate(state.currentDate);
}

// ==========================================
// 球员数据
// ==========================================
function setupPlayerSearch() {
    const doSearch = () => {
        const query = el.playerSearch.value.trim();
        if (query) searchPlayers(query);
    };

    el.searchBtn.addEventListener('click', doSearch);
    el.playerSearch.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') doSearch();
    });

    // Hot tags
    el.hotTags.forEach(tag => {
        tag.addEventListener('click', () => {
            const name = tag.dataset.player;
            el.playerSearch.value = name;
            searchPlayers(name);
        });
    });
}

async function searchPlayers(query) {
    el.playerResults.innerHTML = `<div class="loading-state"><div class="spinner"></div><p>搜索中...</p></div>`;
    el.playerStatsContainer.classList.remove('visible');
    el.playerStatsContainer.innerHTML = '';

    try {
        const data = await fetchAPI('/players', { search: query, per_page: 24 });
        renderPlayerResults(data.data);
    } catch (err) {
        el.playerResults.innerHTML = `
            <div class="error-state">
                <p>搜索失败: ${err.message}</p>
                <button class="retry-btn" onclick="searchPlayers('${query}')">重试</button>
            </div>`;
    }
}

function renderPlayerResults(players) {
    if (!players || players.length === 0) {
        el.playerResults.innerHTML = `
            <div class="empty-state">
                <p>未找到相关球员，请尝试其他关键词</p>
            </div>`;
        return;
    }

    el.playerResults.innerHTML = players.map(p => {
        const initials = `${p.first_name?.[0] || ''}${p.last_name?.[0] || ''}`;
        const teamName = p.team ? p.team.full_name : '自由球员';
        return `
        <div class="player-card ${state.selectedPlayerId === p.id ? 'selected' : ''}" data-player-id="${p.id}">
            <div class="player-avatar">${initials}</div>
            <div class="player-info">
                <div class="player-name">${p.first_name} ${p.last_name}</div>
                <div class="player-team">${teamName} · ${p.position || 'N/A'}</div>
            </div>
        </div>`;
    }).join('');

    // Click to load stats
    $$('.player-card').forEach(card => {
        card.addEventListener('click', () => {
            const id = parseInt(card.dataset.playerId);
            const player = players.find(p => p.id === id);
            if (player) loadPlayerStats(player);
        });
    });
}

async function loadPlayerStats(player) {
    state.selectedPlayerId = player.id;
    $$('.player-card').forEach(c => c.classList.toggle('selected', parseInt(c.dataset.playerId) === player.id));

    el.playerStatsContainer.innerHTML = `<div class="loading-state"><div class="spinner"></div><p>加载球员数据...</p></div>`;
    el.playerStatsContainer.classList.add('visible');

    try {
        const data = await fetchAPI('/season_averages', {
            season: API.season,
            'player_ids[]': player.id,
        });
        renderPlayerStats(player, data.data?.[0]);
    } catch (err) {
        el.playerStatsContainer.innerHTML = `
            <div class="error-state">
                <p>加载数据失败: ${err.message}</p>
            </div>`;
    }
}

function renderPlayerStats(player, stats) {
    if (!stats) {
        el.playerStatsContainer.innerHTML = `
            <div class="stats-header">
                <div class="player-avatar">${player.first_name?.[0] || ''}${player.last_name?.[0] || ''}</div>
                <h3>${player.first_name} ${player.last_name}</h3>
                <span class="player-team-tag">${player.team?.full_name || '自由球员'}</span>
            </div>
            <div class="empty-state">
                <p>暂无该球员本赛季数据</p>
            </div>`;
        return;
    }

    const teamName = player.team?.full_name || '自由球员';
    const initials = `${player.first_name?.[0] || ''}${player.last_name?.[0] || ''}`;

    const statFields = [
        { label: '场次', key: 'games_played', fixed: 0 },
        { label: '场均分钟', key: 'min', fixed: 1 },
        { label: '得分', key: 'pts', fixed: 1 },
        { label: '篮板', key: 'reb', fixed: 1 },
        { label: '助攻', key: 'ast', fixed: 1 },
        { label: '抢断', key: 'stl', fixed: 1 },
        { label: '盖帽', key: 'blk', fixed: 1 },
        { label: '投篮%', key: 'fg_pct', fixed: 1, suffix: '%', mult: 100 },
        { label: '三分%', key: 'fg3_pct', fixed: 1, suffix: '%', mult: 100 },
        { label: '罚球%', key: 'ft_pct', fixed: 1, suffix: '%', mult: 100 },
        { label: '失误', key: 'turnover', fixed: 1 },
        { label: '犯规', key: 'pf', fixed: 1 },
    ];

    const statsHtml = statFields.map(f => {
        let val = stats[f.key] ?? '-';
        if (val !== '-' && f.mult) val = (val * f.mult);
        val = val !== '-' ? Number(val).toFixed(f.fixed) : '-';
        return `
        <div class="stat-item">
            <div class="stat-value">${val}${f.suffix || ''}</div>
            <div class="stat-label">${f.label}</div>
        </div>`;
    }).join('');

    el.playerStatsContainer.innerHTML = `
        <div class="stats-header">
            <div class="player-avatar" style="width:50px;height:50px;font-size:1.2rem;">${initials}</div>
            <div>
                <h3>${player.first_name} ${player.last_name}</h3>
                <span style="font-size:0.85rem;color:var(--text-secondary);">${teamName} · ${player.position || 'N/A'} · #${stats.player_id}</span>
            </div>
        </div>
        <div class="stats-grid">${statsHtml}</div>`;
}

// ==========================================
// 球队排名
// ==========================================
async function loadStandings() {
    el.standingsContainer.innerHTML = `<div class="loading-state"><div class="spinner"></div><p>正在加载排名数据...</p></div>`;

    try {
        const data = await fetchStandingsFromAPI();
        renderStandings(data);
    } catch (err) {
        el.standingsContainer.innerHTML = `
            <div class="error-state">
                <div class="error-icon">⚠️</div>
                <p>排名数据暂时无法获取</p>
                <p style="font-size:0.8rem;color:var(--text-muted);margin-top:8px;">
                    ${err.message} · 数据较多时可能需要一些时间
                </p>
                <button class="retry-btn" onclick="loadStandings()">重试</button>
            </div>`;
    }
}

async function fetchStandingsFromAPI() {
    // Try: fetch from balldontlie API and compute W/L from games
    const teamsData = await fetchAPI('/teams');
    const teams = teamsData.data;
    const east = teams.filter(t => t.conference === 'East');
    const west = teams.filter(t => t.conference === 'West');

    // Fetch all completed games for the season to compute standings
    let allGames = [];
    let page = 1;
    let totalPages = 1;

    while (page <= totalPages && page <= 5) {  // limit to 5 pages
        const data = await fetchAPI('/games', {
            'seasons[]': API.season,
            per_page: 100,
            page: page,
        });
        allGames = allGames.concat(data.data.filter(g => g.status === 'Final'));
        totalPages = data.meta?.total_pages || 1;
        page++;
    }

    // Compute standings
    const eastStandings = computeTeamRecords(allGames, east);
    const westStandings = computeTeamRecords(allGames, west);

    return { east: eastStandings, west: westStandings };
}

function computeTeamRecords(games, teams) {
    const records = {};
    teams.forEach(t => {
        records[t.id] = { team: t, wins: 0, losses: 0, games: {} };
    });

    games.forEach(g => {
        const { home_team, visitor_team, home_team_score, visitor_team_score } = g;
        if (home_team_score === null || visitor_team_score === null) return;

        const homeId = home_team.id;
        const visitorId = visitor_team.id;

        if (!records[homeId] || !records[visitorId]) return;

        if (home_team_score > visitor_team_score) {
            records[homeId].wins++;
            records[visitorId].losses++;
        } else {
            records[visitorId].wins++;
            records[homeId].losses++;
        }
    });

    const result = Object.values(records)
        .filter(r => r.wins + r.losses > 0)
        .map(r => ({
            ...r,
            pct: r.wins / (r.wins + r.losses),
            streak: [],
        }))
        .sort((a, b) => b.pct - a.pct);

    return result;
}

function renderStandings(data) {
    const { east, west } = data;

    el.standingsContainer.innerHTML = `
        <div class="conference">
            <div class="conference-header east">🏀 东部联盟</div>
            ${renderStandingsTable(east, 'east')}
        </div>
        <div class="conference">
            <div class="conference-header west">🏀 西部联盟</div>
            ${renderStandingsTable(west, 'west')}
        </div>`;
}

function renderStandingsTable(teams, conf) {
    if (!teams || teams.length === 0) {
        return `<div style="padding:40px;text-align:center;color:var(--text-muted);font-size:0.85rem;">
            暂无数据（需通过 Cloudflare 部署获取完整排名）</div>`;
    }

    const rows = teams.map((t, i) => {
        const pct = t.pct ? (t.pct * 100).toFixed(1) : '0.0';
        return `
        <tr>
            <td class="rank">${i + 1}</td>
            <td>
                <div class="team-cell">
                    <img class="team-logo" src="${getTeamLogo(t.team.id)}" alt="${t.team.abbreviation}" loading="lazy"
                         onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 24 24%22><rect fill=%22%231a2035%22 width=%2224%22 height=%2224%22 rx=%224%22/><text x=%2212%22 y=%2216%22 text-anchor=%22middle%22 font-size=%2210%22 fill=%22%2394a3b8%22>${t.team.abbreviation}</text></svg>'">
                    <span class="team-name">${getTeamCn(t.team.id)}</span>
                </div>
            </td>
            <td>${t.wins}</td>
            <td>${t.losses}</td>
            <td class="win-pct">${pct}%</td>
        </tr>`;
    }).join('');

    return `
    <table class="standings-table">
        <thead>
            <tr>
                <th>排名</th>
                <th>球队</th>
                <th>胜</th>
                <th>负</th>
                <th>胜率</th>
            </tr>
        </thead>
        <tbody>${rows}</tbody>
    </table>`;
}

// ==========================================
// 初始化
// ==========================================
async function init() {
    cacheDOM();
    setupTabs();
    setupDateNav();
    setupPlayerSearch();

    // Load teams first
    await loadTeams();

    // Load default tab
    const savedTab = $('.tab-btn.active')?.dataset.tab || 'games';
    switchTab(savedTab);

    // Keyboard shortcut: Cmd/Ctrl + K for search focus
    document.addEventListener('keydown', (e) => {
        if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
            e.preventDefault();
            el.playerSearch.focus();
        }
    });
}

document.addEventListener('DOMContentLoaded', init);
