/* =============================================
   NBA 篮球视界 - 主应用逻辑 (ESPN API)
   ============================================= */

// ===== 配置 =====
const API = {
    scoreboard: 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard',
    news: 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba/news',
    stats: 'https://site.api.espn.com/apis/common/v3/sports/basketball/nba/statistics/byathlete',
};

// ===== 球队中文名 =====
const TEAM_CN = {
    'ATL': '老鹰', 'BOS': '凯尔特人', 'BKN': '篮网', 'CHA': '黄蜂', 'CHI': '公牛',
    'CLE': '骑士', 'DAL': '独行侠', 'DEN': '掘金', 'DET': '活塞', 'GSW': '勇士',
    'HOU': '火箭', 'IND': '步行者', 'LAC': '快船', 'LAL': '湖人', 'MEM': '灰熊',
    'MIA': '热火', 'MIL': '雄鹿', 'MIN': '森林狼', 'NOP': '鹈鹕', 'NYK': '尼克斯',
    'OKC': '雷霆', 'ORL': '魔术', 'PHI': '76人', 'PHX': '太阳', 'POR': '开拓者',
    'SAC': '国王', 'SAS': '马刺', 'TOR': '猛龙', 'UTA': '爵士', 'WAS': '奇才',
};

// ESPN缩写 → 标准3字母缩写映射
const ABBR_MAP = {
    'NY': 'NYK', 'SA': 'SAS', 'PHO': 'PHX', 'GS': 'GSW', 'NO': 'NOP',
    'UTAH': 'UTA', 'WSH': 'WAS',
};

// 球队颜色
const TEAM_COLORS = {
    'ATL': '#E03A3E', 'BOS': '#007A33', 'BKN': '#000000', 'CHA': '#1D1160',
    'CHI': '#CE1141', 'CLE': '#860038', 'DAL': '#00538C', 'DEN': '#0E2240',
    'DET': '#1D42BA', 'GSW': '#1D428A', 'HOU': '#CE1141', 'IND': '#002D62',
    'LAC': '#C8102E', 'LAL': '#552583', 'MEM': '#5D76A9', 'MIA': '#98002E',
    'MIL': '#00471B', 'MIN': '#0C2340', 'NOP': '#0C2340', 'NYK': '#F58426',
    'OKC': '#007AC1', 'ORL': '#0077C0', 'PHI': '#006BB6', 'PHX': '#1D1160',
    'POR': '#E03A3E', 'SAC': '#5A2D81', 'SAS': '#C4CED4', 'TOR': '#CE1141',
    'UTA': '#002B5C', 'WAS': '#002B5C',
};

// ===== 状态 =====
let state = {
    teams: [],
    currentDate: '',
    standingsCache: null,
    selectedLB: 'pts',
    refreshTimer: null,
};

// ===== DOM =====
const $ = (s, c = document) => c.querySelector(s);
const $$ = (s, c = document) => [...c.querySelectorAll(s)];
const el = {};

function cacheDOM() {
    el.headerDate = $('#headerDate');
    el.liveIndicator = $('#liveIndicator');
    el.tabBtns = $$('.tab-btn');
    el.newsScroll = $('#newsScroll');
    el.displayDate = $('#displayDate');
    el.prevDateBtn = $('#prevDateBtn');
    el.nextDateBtn = $('#nextDateBtn');
    el.todayBtn = $('#todayBtn');
    el.gamesContainer = $('#gamesContainer');
    el.lbTabs = $$('.lb-tab');
    el.lbContainer = $('#leaderboardContainer');
    el.standingsContainer = $('#standingsContainer');
}

// ===== 工具函数 =====
function getUSDate(offset = 0) {
    // 使用美东时间(UTC-4)，ESPN API 以此为准
    const d = new Date();
    const utc = d.getTime() + d.getTimezoneOffset() * 60000;
    const us = new Date(utc - 4 * 3600000);
    us.setDate(us.getDate() + offset);
    return us;
}

function fmtDateKey(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${y}${m}${dd}`;
}

function fmtDateDisplay(d) {
    const wk = ['日','一','二','三','四','五','六'];
    return `${d.getMonth()+1}月${d.getDate()}日 周${wk[d.getDay()]}`;
}

function fmtHeaderDate(d) {
    const wk = ['日','一','二','三','四','五','六'];
    return `${d.getFullYear()}年${d.getMonth()+1}月${d.getDate()}日 周${wk[d.getDay()]}`;
}

function resolveAbbr(abbr) { return ABBR_MAP[abbr] || abbr; }
function getCn(abbr) { return TEAM_CN[resolveAbbr(abbr)] || abbr; }
function getColor(abbr) { return TEAM_COLORS[resolveAbbr(abbr)] || '#333'; }

function getLogo(abbr) {
    return `https://a.espncdn.com/combiner/i?img=/i/teamlogos/nba/500/${resolveAbbr(abbr)}.png&h=48&w=48`;
}

function getLogoSm(abbr) {
    return `https://a.espncdn.com/combiner/i?img=/i/teamlogos/nba/500/${resolveAbbr(abbr)}.png&h=24&w=24`;
}

function timeAgo(iso) {
    const t = new Date(iso).getTime();
    const n = Date.now();
    const diff = n - t;
    const min = Math.floor(diff / 60000);
    if (min < 1) return '刚刚';
    if (min < 60) return `${min}分钟前`;
    const h = Math.floor(min / 60);
    if (h < 24) return `${h}小时前`;
    return `${Math.floor(h/24)}天前`;
}

// ===== API 调用 =====
async function fetchJson(url) {
    const r = await fetch(url, { headers: { 'Accept': 'application/json' } });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
}

async function fetchScoreboard(dateKey) {
    const url = dateKey
        ? `${API.scoreboard}?dates=${dateKey}`
        : API.scoreboard;
    return fetchJson(url);
}

// ===== 标签切换 =====
function setupTabs() {
    el.tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const tab = btn.dataset.tab;
            $$('.tab-btn').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
            $$('.tab-content').forEach(t => t.classList.toggle('active', t.id === `tab-${tab}`));
            if (tab === 'games') loadGames();
            if (tab === 'players') loadLeaders(state.selectedLB);
            if (tab === 'standings') loadStandings();
        });
    });
}

// ==========================================
// 新闻
// ==========================================
async function loadNews() {
    try {
        const data = await fetchJson(API.news);
        renderNews(data.articles || []);
    } catch (e) {
        el.newsScroll.innerHTML = `<span style="color:var(--text-muted);font-size:0.8rem;">新闻暂时无法加载</span>`;
    }
}

function renderNews(articles) {
    if (!articles.length) {
        el.newsScroll.innerHTML = `<span style="color:var(--text-muted);font-size:0.8rem;">暂无新闻</span>`;
        return;
    }

    el.newsScroll.innerHTML = articles.slice(0, 12).map(a => {
        const img = a.images?.[0]?.url || '';
        const src = a.byline || 'ESPN';
        return `
        <a class="news-card" href="${a.links?.web?.href || '#'}" target="_blank" rel="noopener">
            <div class="news-card-img" style="background:${img ? `url(${img}) center/cover` : 'linear-gradient(135deg,var(--bg-secondary),var(--bg-card))'};"></div>
            <div class="news-card-body">
                <div class="news-card-title">${a.headline || a.description || ''}</div>
                <div class="news-card-meta">
                    <span class="news-card-source">${src}</span>
                    <span class="news-card-time">${timeAgo(a.published)}</span>
                </div>
            </div>
        </a>`;
    }).join('');
}

// ==========================================
// 今日赛程
// ==========================================
function setupDateNav() {
    state.currentDate = getUSDate();
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
        state.currentDate = getUSDate();
        updateDateDisplay();
        loadGames();
    });
}

function updateDateDisplay() {
    el.displayDate.textContent = fmtDateDisplay(state.currentDate);
    el.headerDate.textContent = fmtHeaderDate(state.currentDate);
}

async function loadGames() {
    const key = fmtDateKey(state.currentDate);
    el.gamesContainer.innerHTML = `<div class="loading-state"><div class="spinner"></div><p>正在加载赛程数据...</p></div>`;

    try {
        const data = await fetchScoreboard(key);
        const events = data.events || [];
        renderGames(events);

        // Extract standings data from games
        events.forEach(e => {
            const comp = e.competitions?.[0];
            if (comp) {
                comp.competitors?.forEach(c => {
                    const abbr = c.team?.abbreviation;
                    const rec = c.records?.find(r => r.type === 'total');
                    if (abbr && rec) {
                        const parts = rec.summary.split('-');
                        const w = parseInt(parts[0]), l = parseInt(parts[1]);
                        if (!isNaN(w) && !isNaN(l)) {
                            state.standingsCache = state.standingsCache || {};
                            state.standingsCache[abbr] = { w, l, pct: w / (w + l) };
                        }
                    }
                });
            }
        });

        // Live indicator
        const hasLive = events.some(e => e.competitions?.[0]?.status?.type?.state === 'in');
        el.liveIndicator.classList.toggle('active', hasLive);
        if (hasLive) startAutoRefresh();

    } catch (e) {
        el.gamesContainer.innerHTML = `
            <div class="error-state">
                <div class="error-icon">🏀</div>
                <p>加载失败，请检查网络连接</p>
                <p style="font-size:0.75rem;color:var(--text-muted);margin-top:6px;">${e.message}</p>
                <button class="retry-btn" onclick="loadGames()" style="margin-top:12px;">重试</button>
            </div>`;
    }
}

function renderGames(events) {
    if (!events.length) {
        el.gamesContainer.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">📅</div>
                <p style="font-size:1.1rem;">该日暂无比赛</p>
                <p style="font-size:0.8rem;color:var(--text-muted);margin-top:6px;">点击日期切换查看其他日期</p>
            </div>`;
        return;
    }

    // Sort: live first, then completed, then scheduled
    const order = e => {
        const s = e.competitions?.[0]?.status?.type?.state;
        if (s === 'in') return 0;
        if (s === 'post') return 1;
        return 2;
    };
    const sorted = [...events].sort((a, b) => order(a) - order(b));

    el.gamesContainer.innerHTML = sorted.map(e => renderGameCard(e)).join('');
}

function renderGameCard(event) {
    const comp = event.competitions?.[0] || {};
    const status = comp.status?.type || {};
    const isLive = status.state === 'in';
    const isFinal = status.state === 'post';
    const isPre = status.state === 'pre';

    const competitors = comp.competitors || [];
    const home = competitors.find(c => c.homeAway === 'home');
    const away = competitors.find(c => c.homeAway === 'away');
    if (!home || !away) return '';

    const hTeam = home.team || {};
    const aTeam = away.team || {};
    const hAbbr = hTeam.abbreviation || '';
    const aAbbr = aTeam.abbreviation || '';
    const hScore = home.score || '0';
    const aScore = away.score || '0';
    const hRec = home.records?.find(r => r.type === 'total')?.summary || '';
    const aRec = away.records?.find(r => r.type === 'total')?.summary || '';

    const hWin = isFinal && parseInt(hScore) > parseInt(aScore);
    const aWin = isFinal && parseInt(aScore) > parseInt(hScore);

    let badge = '',
        detail = '';
    if (isFinal) {
        badge = `<span class="game-status-badge final">已结束</span>`;
        detail = comp.status.type.detail || 'Final';
    } else if (isLive) {
        const per = comp.status.period || 1;
        const q = per > 4 ? `加时${per - 4}` : `第${per}节`;
        const clock = comp.status.displayClock || '';
        badge = `<span class="game-status-badge live">▶ ${q}</span>`;
        detail = clock ? `${clock}` : '';
    } else {
        badge = `<span class="game-status-badge scheduled">未开始</span>`;
        const d = new Date(event.date || comp.date);
        if (!isNaN(d.getTime())) {
            const h = String(d.getHours()).padStart(2, '0');
            const m = String(d.getMinutes()).padStart(2, '0');
            detail = `${h}:${m} 开赛`;
        }
    }

    return `
    <div class="game-card${isLive ? ' live' : ''}">
        <div class="game-team visitor">
            <div class="game-team-info">
                <div class="game-team-name" style="color:${getColor(aAbbr)}">${getCn(aAbbr)}</div>
                <div class="game-team-record">${aAbbr} ${aRec}</div>
            </div>
            <img class="game-team-logo" src="${getLogo(aAbbr)}" alt="${aAbbr}" onerror="this.style.display='none'">
        </div>
        <div class="game-score-section">
            <span class="game-score ${aWin ? 'winner' : ''}">${isPre ? '-' : aScore}</span>
            <span class="game-score-divider">:</span>
            <span class="game-score ${hWin ? 'winner' : ''}">${isPre ? '-' : hScore}</span>
        </div>
        <div class="game-team home">
            <img class="game-team-logo" src="${getLogo(hAbbr)}" alt="${hAbbr}" onerror="this.style.display='none'">
            <div class="game-team-info">
                <div class="game-team-name" style="color:${getColor(hAbbr)}">${getCn(hAbbr)}</div>
                <div class="game-team-record">${hAbbr} ${hRec}</div>
            </div>
        </div>
        <div class="game-status">
            ${badge}
            <div class="game-status-time">${detail}</div>
        </div>
    </div>`;
}

function startAutoRefresh() {
    if (state.refreshTimer) clearInterval(state.refreshTimer);
    state.refreshTimer = setInterval(() => {
        const active = $('.tab-btn.active');
        if (active?.dataset.tab === 'games') loadGames();
    }, 30000);
}

// ==========================================
// 球员数据 (v3 Statistics API)
// ==========================================
const LB_CONFIG = {
    pts: { label: '得分王', cat: 'pointsPerGame', abbrev: 'PTS' },
    reb: { label: '篮板王', cat: 'reboundsPerGame', abbrev: 'REB' },
    ast: { label: '助攻王', cat: 'assistsPerGame', abbrev: 'AST' },
    stl: { label: '抢断王', cat: 'stealsPerGame', abbrev: 'STL' },
    blk: { label: '盖帽王', cat: 'blocksPerGame', abbrev: 'BLK' },
};

// Stat category index mapping for v3 API response
// offensive values: [PTS, FGM, FGA, FG%, 3PM, 3PA, 3P%, FTM, FTA, FT%, REB, AST, ...]
// defensive values: [STL, BLK, ...]
const STAT_IDX = {
    pts: { cat: 'offensive', idx: 0 },
    reb: { cat: 'offensive', idx: 10 },
    ast: { cat: 'offensive', idx: 11 },
    stl: { cat: 'defensive', idx: 0 },
    blk: { cat: 'defensive', idx: 1 },
};

function setupLeaderboard() {
    el.lbTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const cat = tab.dataset.cat;
            el.lbTabs.forEach(t => t.classList.toggle('active', t.dataset.cat === cat));
            state.selectedLB = cat;
            loadLeaders(cat);
        });
    });
}

async function loadLeaders(category) {
    const cfg = LB_CONFIG[category];
    el.lbContainer.innerHTML = `<div class="loading-state"><div class="spinner"></div><p>加载${cfg.label}数据...</p></div>`;

    try {
        const url = `${API.stats}?page=1&limit=50`;
        const data = await fetchJson(url);
        const athletes = data.athletes || [];

        if (!athletes.length) throw new Error('No athlete data');

        // Extract stat values and sort
        const statMap = STAT_IDX[category];
        const entries = athletes.map(a => {
            const catData = a.categories?.find(c => c.name === statMap.cat);
            const val = catData?.values?.[statMap.idx];
            const athlete = a.athlete || {};
            const rawAbbr = athlete.teams?.[0]?.abbreviation || athlete.teamShortName || '';
            return {
                athlete: athlete,
                value: typeof val === 'number' ? val : 0,
                teamAbbr: resolveAbbr(rawAbbr),
                displayValue: val != null ? val.toFixed(1) : '-',
            };
        }).filter(e => e.value > 0)
          .sort((a, b) => b.value - a.value)
          .slice(0, 10);

        if (entries.length) {
            renderLeaders(entries, cfg);
        } else {
            el.lbContainer.innerHTML = `<div class="empty-state"><p>暂无${cfg.label}数据</p></div>`;
        }
    } catch (e) {
        el.lbContainer.innerHTML = `
            <div class="error-state">
                <p>加载失败</p>
                <p style="font-size:0.75rem;color:var(--text-muted);margin-top:6px;">${e.message}</p>
                <button class="retry-btn" onclick="loadLeaders('${category}')">重试</button>
            </div>`;
    }
}

function renderLeaders(entries, cfg) {
    el.lbContainer.innerHTML = entries.map((entry, i) => {
        const athlete = entry.athlete;
        const name = athlete.displayName || 'Unknown';
        const headshot = athlete.headshot?.href || '';
        const abbr = entry.teamAbbr;

        const rankClass = i === 0 ? 'gold' : i === 1 ? 'silver' : i === 2 ? 'bronze' : '';
        const cardClass = i === 0 ? 'top-1' : i === 1 ? 'top-2' : i === 2 ? 'top-3' : '';

        return `
        <div class="leaderboard-card ${cardClass}">
            <div class="lb-rank ${rankClass}">${i + 1}</div>
            <div class="lb-avatar">
                ${headshot ? `<img src="${headshot}" alt="${name}" onerror="this.style.display='none'">` : ''}
            </div>
            <div class="lb-info">
                <div class="lb-name">${name}</div>
                <div class="lb-team">${abbr ? `${getCn(abbr)} (${abbr})` : ''}</div>
            </div>
            <div>
                <div class="lb-value">${entry.displayValue}</div>
                <div class="lb-label">${cfg.abbrev}</div>
            </div>
        </div>`;
    }).join('');
}

// ==========================================
// 球队排名
// ==========================================
async function loadStandings() {
    el.standingsContainer.innerHTML = `<div class="loading-state"><div class="spinner"></div><p>正在加载排名数据...</p></div>`;

    try {
        // Fetch multiple days to get all team records
        const daysToFetch = 5;
        const fetches = [];
        for (let i = 0; i < daysToFetch; i++) {
            const d = getUSDate(-i);
            fetches.push(fetchScoreboard(fmtDateKey(d)));
        }

        const results = await Promise.allSettled(fetches);
        const teamsData = {};

        results.forEach(result => {
            if (result.status !== 'fulfilled') return;
            const events = result.value.events || [];
            events.forEach(e => {
                const comp = e.competitions?.[0];
                if (!comp) return;
                comp.competitors?.forEach(c => {
                    const abbr = c.team?.abbreviation;
                    const rec = c.records?.find(r => r.type === 'total');
                    if (abbr && rec) {
                        const parts = rec.summary.split('-');
                        const w = parseInt(parts[0]), l = parseInt(parts[1]);
                        if (!isNaN(w) && !isNaN(l)) {
                            teamsData[abbr] = { // overwrite to keep latest
                                name: c.team.displayName || abbr,
                                abbr,
                                cn: getCn(abbr),
                                w, l,
                                pct: w / (w + l),
                            };
                        }
                    }
                });
            });
        });

        const allTeams = Object.values(teamsData);
        if (!allTeams.length) throw new Error('No team data');

        // Sort by conference
        const east = allTeams.filter(t => isEast(t.abbr)).sort((a, b) => b.pct - a.pct);
        const west = allTeams.filter(t => !isEast(t.abbr)).sort((a, b) => b.pct - a.pct);

        renderStandingsTable(east, west);
    } catch (e) {
        el.standingsContainer.innerHTML = `
            <div class="error-state">
                <div class="error-icon">🏆</div>
                <p>排名数据暂时不可用</p>
                <p style="font-size:0.78rem;color:var(--text-muted);margin-top:6px;">${e.message}</p>
                <button class="retry-btn" onclick="loadStandings()" style="margin-top:12px;">重试</button>
            </div>`;
    }
}

function isEast(abbr) {
    const east = ['BOS', 'NYK', 'PHI', 'BKN', 'TOR', 'MIL', 'CLE', 'IND', 'CHI',
                  'DET', 'MIA', 'ATL', 'ORL', 'CHA', 'WAS'];
    return east.includes(abbr);
}

function renderStandingsTable(east, west) {
    el.standingsContainer.innerHTML = `
        <div class="conf-card">
            <div class="conf-header east">🏀 东部联盟</div>
            ${buildTable(east)}
        </div>
        <div class="conf-card">
            <div class="conf-header west">🏀 西部联盟</div>
            ${buildTable(west)}
        </div>`;
}

function buildTable(teams) {
    if (!teams?.length) {
        return `<div style="padding:30px;text-align:center;color:var(--text-muted);font-size:0.85rem;">
            暂无数据（NBA 休赛期）</div>`;
    }

    return `
    <table class="standings-table">
        <thead>
            <tr><th>#</th><th>球队</th><th>胜</th><th>负</th><th>胜率</th><th>场差</th></tr>
        </thead>
        <tbody>
            ${teams.map((t, i) => {
                const gb = i === 0 ? '-' : calcGB(teams, t, i);
                return `
                <tr>
                    <td class="rank-cell"><span class="playoff-indicator ${i < 8 ? 'confirmed' : 'eliminated'}"></span>${i + 1}</td>
                    <td>
                        <div class="team-cell">
                            <img class="team-logo-sm" src="${getLogoSm(t.abbr)}" alt="${t.abbr}" onerror="this.style.display='none'">
                            <span class="team-name" style="color:${getColor(t.abbr)}">${t.cn}</span>
                        </div>
                    </td>
                    <td>${t.w}</td>
                    <td>${t.l}</td>
                    <td class="pct-cell">${(t.pct * 100).toFixed(1)}%</td>
                    <td style="color:var(--text-muted);font-size:0.75rem;">${gb}</td>
                </tr>`;
            }).join('')}
        </tbody>
    </table>`;
}

function calcGB(teams, t, i) {
    if (i === 0) return '-';
    const first = teams[0];
    const diff = (first.w - first.l) - (t.w - t.l);
    return (diff / 2).toFixed(1);
}

// ==========================================
// 初始化
// ==========================================
async function init() {
    cacheDOM();
    setupTabs();
    setupDateNav();
    setupLeaderboard();

    // Load initial data
    const activeTab = $('.tab-btn.active')?.dataset.tab || 'games';
    await Promise.all([
        loadNews(),
        activeTab === 'games' ? loadGames() :
        activeTab === 'players' ? loadLeaders(state.selectedLB) :
        loadStandings(),
    ]);
}

document.addEventListener('DOMContentLoaded', init);
