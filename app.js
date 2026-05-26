// ── STATE ──
let currentTag = 'programming';
let currentLabel = '💻 Programming';
let allArticles = [];
let searchQuery = '';
let sortMode = 'newest';
let bookmarks = JSON.parse(localStorage.getItem('gn_bookmarks') || '[]');
let readHistory = JSON.parse(localStorage.getItem('gn_history') || '[]');
let countdownInterval, countdownSecs = 600;

// ── SOURCE MAPS ──
const HN_MAP = {
  'programming':'programming','ai':'artificial intelligence','datascience':'data science',
  'technology':'technology','startup':'startup','design':'UX design',
  'science':'science','health':'health','finance':'finance',
  'python':'python','javascript':'javascript','security':'cybersecurity',
  'machinelearning':'machine learning','blockchain':'crypto blockchain',
  'stocks':'stock market investing','forex':'forex currency trading',
  'education':'online learning education courses','career':'tech career software engineering jobs',
  'llm':'large language models LLM GPT prompt engineering','jobs':'software engineering jobs hiring remote',
  'entertainment':'movies TV shows gaming entertainment',
  'gaming':'video games gaming indie steam','research':'research paper arxiv science',
  'remotejobs':'remote work jobs hiring','commodities':'gold silver oil commodities markets'
};

const REDDIT_MAP = {
  'programming':'programming','ai':'artificial','datascience':'datascience',
  'technology':'technology','startup':'startups','design':'web_design',
  'science':'science','health':'health','finance':'personalfinance',
  'python':'Python','javascript':'javascript','security':'netsec',
  'machinelearning':'MachineLearning','blockchain':'CryptoCurrency',
  'stocks':'stocks','forex':'Forex',
  'education':'learnprogramming','career':'cscareerquestions',
  'llm':'LocalLLaMA','jobs':'forhire','entertainment':'entertainment',
  'gaming':'gaming','research':'science','remotejobs':'remotework',
  'commodities':'investing'
};

const REDDIT_MAP2 = {
  'stocks':'investing','forex':'algotrading','ai':'MachineLearning',
  'blockchain':'Bitcoin','security':'cybersecurity','technology':'gadgets',
  'education':'GetStudying','career':'careerguidance',
  'llm':'ChatGPT','jobs':'remotework','entertainment':'movies',
  'gaming':'pcgaming','research':'MachineLearning','remotejobs':'freelance',
  'commodities':'Forex'
};

const MEDIUM_MAP = {
  'programming':'programming','ai':'artificial-intelligence','datascience':'data-science',
  'technology':'technology','startup':'entrepreneurship','design':'design',
  'science':'science','health':'health','finance':'finance',
  'python':'python','javascript':'javascript','security':'cybersecurity',
  'machinelearning':'machine-learning','blockchain':'blockchain',
  'stocks':'investing','forex':'trading',
  'education':'education','career':'career-advice',
  'llm':'llm','jobs':'job-search','entertainment':'entertainment',
  'gaming':'gaming','research':'research','remotejobs':'remote-work',
  'commodities':'trading'
};

// XDA is only fetched for tech-adjacent categories
const XDA_CATS = new Set(['technology','programming','ai','design','security']);

// ── API 1: DEV.to ──
async function fetchDevTo(tag) {
  const url = `https://dev.to/api/articles?tag=${encodeURIComponent(tag)}&per_page=25&top=1`;
  const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error(`DEV.to HTTP ${res.status}`);
  const data = await res.json();
  if (!data.length) throw new Error('DEV.to returned 0 articles');
  return data.map(a => ({
    title: a.title, link: a.url,
    author: a.user?.name || 'DEV.to',
    pubDate: a.published_at,
    description: a.description || '',
    thumb: a.cover_image || a.social_image || '',
    categories: a.tag_list || [],
    readTime: a.reading_time_minutes || 3,
    source: 'devto'
  }));
}

// ── API 2: HackerNews via Algolia ──
async function fetchHN(query) {
  const url = `https://hn.algolia.com/api/v1/search_by_date?tags=story&query=${encodeURIComponent(query)}&hitsPerPage=20`;
  const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error(`HN HTTP ${res.status}`);
  const data = await res.json();
  const hits = data.hits.filter(h => h.url && h.title);
  if (!hits.length) throw new Error('HN returned 0 stories');
  return hits.map(h => ({
    title: h.title, link: h.url,
    author: h.author || 'HN',
    pubDate: h.created_at,
    description: `${h.points||0} pts · ${h.num_comments||0} comments on Hacker News`,
    thumb: '', categories: [], readTime: 5, source: 'hn'
  }));
}

// ── API 3: Reddit JSON ──
async function fetchReddit(subreddit) {
  const url = `https://www.reddit.com/r/${subreddit}/hot.json?limit=20&t=day&raw_json=1`;
  const res = await fetch(url, { headers:{'Accept':'application/json'}, signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error(`Reddit HTTP ${res.status}`);
  const data = await res.json();
  const posts = (data.data?.children || []).filter(p => !p.data.stickied && p.data.url && p.data.score > 5);
  if (!posts.length) throw new Error(`Reddit r/${subreddit} 0 posts`);
  return posts.map(p => ({
    title: p.data.title,
    link: p.data.is_self ? `https://reddit.com${p.data.permalink}` : (p.data.url || `https://reddit.com${p.data.permalink}`),
    author: p.data.author || 'Reddit',
    pubDate: new Date(p.data.created_utc * 1000).toISOString(),
    description: p.data.selftext ? p.data.selftext.slice(0,200) : `⬆ ${p.data.score} · 💬 ${p.data.num_comments} · r/${subreddit}`,
    thumb: (p.data.thumbnail && p.data.thumbnail.startsWith('http')) ? p.data.thumbnail : '',
    categories: [subreddit], readTime: 3, source: 'reddit'
  }));
}

// ── API 4: Medium via RSS2JSON ──
async function fetchMedium(tag) {
  const rssUrl = encodeURIComponent(`https://medium.com/feed/tag/${tag}`);
  const url = `https://api.rss2json.com/v1/api.json?rss_url=${rssUrl}&count=15`;
  const res = await fetch(url, { signal: AbortSignal.timeout(12000) });
  if (!res.ok) throw new Error(`Medium RSS HTTP ${res.status}`);
  const data = await res.json();
  if (data.status !== 'ok' || !data.items?.length) throw new Error('Medium returned 0 articles');
  return data.items.map(a => ({
    title: a.title, link: a.link,
    author: a.author || 'Medium',
    pubDate: a.pubDate,
    description: (a.description||'').replace(/<[^>]+>/g,'').slice(0,200),
    thumb: a.thumbnail || '',
    categories: a.categories || [],
    readTime: Math.max(2, Math.ceil(((a.content||'').split(' ').length) / 200)),
    source: 'medium'
  }));
}

// ── API 5: XDA Developers via RSS2JSON ──
async function fetchXDA() {
  const rssUrl = encodeURIComponent('https://www.xda-developers.com/feed/');
  const url = `https://api.rss2json.com/v1/api.json?rss_url=${rssUrl}&count=12`;
  const res = await fetch(url, { signal: AbortSignal.timeout(12000) });
  if (!res.ok) throw new Error(`XDA RSS HTTP ${res.status}`);
  const data = await res.json();
  if (data.status !== 'ok' || !data.items?.length) throw new Error('XDA returned 0 articles');
  return data.items.map(a => ({
    title: a.title, link: a.link,
    author: a.author || 'XDA',
    pubDate: a.pubDate,
    description: (a.description||'').replace(/<[^>]+>/g,'').slice(0,200),
    thumb: a.thumbnail || '',
    categories: a.categories || [],
    readTime: 4, source: 'xda'
  }));
}

// ── API 6: freeCodeCamp News via RSS2JSON ──
async function fetchFreeCodeCamp() {
  const rssUrl = encodeURIComponent('https://www.freecodecamp.org/news/rss/');
  const url = `https://api.rss2json.com/v1/api.json?rss_url=${rssUrl}&count=15`;
  const res = await fetch(url, { signal: AbortSignal.timeout(12000) });
  if (!res.ok) throw new Error(`FCC RSS HTTP ${res.status}`);
  const data = await res.json();
  if (data.status !== 'ok' || !data.items?.length) throw new Error('FCC returned 0 articles');
  return data.items.map(a => ({
    title: a.title, link: a.link,
    author: a.author || 'freeCodeCamp',
    pubDate: a.pubDate,
    description: (a.description||'').replace(/<[^>]+>/g,'').slice(0,200),
    thumb: a.thumbnail || '',
    categories: a.categories || [],
    readTime: Math.max(3, Math.ceil(((a.content||'').split(' ').length) / 200)),
    source: 'fcc'
  }));
}

// ── API 7: HackerNews Jobs (Firebase API) ──
async function fetchHNJobs() {
  // Fetch top job story IDs from HN
  const idsRes = await fetch('https://hacker-news.firebaseio.com/v0/jobstories.json', { signal: AbortSignal.timeout(8000) });
  if (!idsRes.ok) throw new Error(`HN Jobs ${idsRes.status}`);
  const ids = await idsRes.json();
  if (!ids?.length) throw new Error('HN Jobs: no listings');
  // Fetch top 12 job details in parallel
  const top = ids.slice(0, 12);
  const stories = await Promise.allSettled(
    top.map(id => fetch(`https://hacker-news.firebaseio.com/v0/item/${id}.json`, { signal: AbortSignal.timeout(6000) }).then(r => r.json()))
  );
  const items = stories.filter(s => s.status === 'fulfilled' && s.value?.title).map(s => s.value);
  if (!items.length) throw new Error('HN Jobs: 0 valid listings');
  return items.map(h => ({
    title: h.title, link: h.url || `https://news.ycombinator.com/item?id=${h.id}`,
    author: h.by || 'HN Jobs',
    pubDate: new Date(h.time * 1000).toISOString(),
    description: h.text ? h.text.replace(/<[^>]+>/g, '').slice(0, 200) : 'Job listing on Hacker News',
    thumb: '', categories: ['jobs', 'hiring'], readTime: 2, source: 'hnjobs'
  }));
}

// ── API 8: The Verge RSS (via RSS2JSON) — Entertainment/Tech culture ──
async function fetchVerge() {
  const rssUrl = encodeURIComponent('https://www.theverge.com/rss/index.xml');
  const url = `https://api.rss2json.com/v1/api.json?rss_url=${rssUrl}&count=15`;
  const res = await fetch(url, { signal: AbortSignal.timeout(12000) });
  if (!res.ok) throw new Error(`Verge RSS ${res.status}`);
  const data = await res.json();
  if (data.status !== 'ok' || !data.items?.length) throw new Error('Verge: 0 articles');
  return data.items.map(a => ({
    title: a.title, link: a.link,
    author: a.author || 'The Verge',
    pubDate: a.pubDate,
    description: (a.description || '').replace(/<[^>]+>/g, '').slice(0, 200),
    thumb: a.thumbnail || '',
    categories: a.categories || [],
    readTime: Math.max(2, Math.ceil(((a.content || '').split(' ').length) / 200)),
    source: 'verge'
  }));
}

// ── API 9: Ars Technica RSS (via RSS2JSON) — LLM & Tech in-depth ──
async function fetchArsTechnica() {
  const rssUrl = encodeURIComponent('https://feeds.arstechnica.com/arstechnica/index');
  const url = `https://api.rss2json.com/v1/api.json?rss_url=${rssUrl}&count=15`;
  const res = await fetch(url, { signal: AbortSignal.timeout(12000) });
  if (!res.ok) throw new Error(`Ars Technica RSS ${res.status}`);
  const data = await res.json();
  if (data.status !== 'ok' || !data.items?.length) throw new Error('Ars Technica: 0 articles');
  return data.items.map(a => ({
    title: a.title, link: a.link,
    author: a.author || 'Ars Technica',
    pubDate: a.pubDate,
    description: (a.description || '').replace(/<[^>]+>/g, '').slice(0, 200),
    thumb: a.thumbnail || '',
    categories: a.categories || [],
    readTime: Math.max(3, Math.ceil(((a.content || '').split(' ').length) / 200)),
    source: 'ars'
  }));
}
// ── API 11: TechCrunch RSS ──
async function fetchTechCrunch() {
  const rssUrl = encodeURIComponent('https://techcrunch.com/feed/');
  const url = `https://api.rss2json.com/v1/api.json?rss_url=${rssUrl}&count=15`;
  const res = await fetch(url, { signal: AbortSignal.timeout(12000) });
  if (!res.ok) throw new Error(`TechCrunch ${res.status}`);
  const data = await res.json();
  if (data.status !== 'ok' || !data.items?.length) throw new Error('TechCrunch: 0 items');
  return data.items.map(a => ({
    title: a.title, link: a.link, author: a.author || 'TechCrunch',
    pubDate: a.pubDate,
    description: (a.description||'').replace(/<[^>]+>/g,'').slice(0,200),
    thumb: a.thumbnail || '', categories: a.categories || [],
    readTime: Math.max(2, Math.ceil(((a.content||'').split(' ').length)/200)),
    source: 'techcrunch'
  }));
}

// ── API 12: The Guardian (open platform, no key for basic RSS) ──
async function fetchGuardian(section='technology') {
  const rssUrl = encodeURIComponent(`https://www.theguardian.com/${section}/rss`);
  const url = `https://api.rss2json.com/v1/api.json?rss_url=${rssUrl}&count=15`;
  const res = await fetch(url, { signal: AbortSignal.timeout(12000) });
  if (!res.ok) throw new Error(`Guardian ${res.status}`);
  const data = await res.json();
  if (data.status !== 'ok' || !data.items?.length) throw new Error('Guardian: 0 items');
  return data.items.map(a => ({
    title: a.title, link: a.link, author: a.author || 'The Guardian',
    pubDate: a.pubDate,
    description: (a.description||'').replace(/<[^>]+>/g,'').slice(0,200),
    thumb: a.thumbnail || '', categories: a.categories || [],
    readTime: Math.max(3, Math.ceil(((a.content||'').split(' ').length)/200)),
    source: 'guardian'
  }));
}

// ── API 13: GitHub Trending (via ghapi) ──
async function fetchGitHubTrending(lang='') {
  const q = lang ? `language:${lang}` : 'stars:>1000';
  const url = `https://api.github.com/search/repositories?q=${encodeURIComponent(q)}&sort=stars&order=desc&per_page=15`;
  const res = await fetch(url, { headers:{'Accept':'application/vnd.github+json'}, signal: AbortSignal.timeout(12000) });
  if (!res.ok) throw new Error(`GitHub ${res.status}`);
  const data = await res.json();
  if (!data.items?.length) throw new Error('GitHub: 0 repos');
  return data.items.map(r => ({
    title: `⭐ ${r.full_name} — ${r.description||'No description'}`,
    link: r.html_url, author: r.owner?.login || 'GitHub',
    pubDate: r.pushed_at || r.created_at,
    description: `${r.description||''} · ⭐ ${r.stargazers_count?.toLocaleString()} stars · 🍴 ${r.forks_count?.toLocaleString()} forks · ${r.language||''}`,
    thumb: r.owner?.avatar_url || '', categories: [r.language||'code'],
    readTime: 2, source: 'github'
  }));
}

// ── API 14: HuggingFace trending models (via HF API) ──
async function fetchHuggingFace() {
  const url = `https://huggingface.co/api/models?sort=likes&direction=-1&limit=15&full=false`;
  const res = await fetch(url, { signal: AbortSignal.timeout(12000) });
  if (!res.ok) throw new Error(`HuggingFace ${res.status}`);
  const data = await res.json();
  if (!data?.length) throw new Error('HuggingFace: 0 models');
  return data.map(m => ({
    title: `🤗 ${m.modelId}`,
    link: `https://huggingface.co/${m.modelId}`,
    author: m.author || m.modelId?.split('/')[0] || 'HuggingFace',
    pubDate: m.lastModified,
    description: `❤️ ${(m.likes||0).toLocaleString()} likes · 📥 ${(m.downloads||0).toLocaleString()} downloads · Pipeline: ${m.pipeline_tag||'unknown'}`,
    thumb: `https://huggingface.co/${m.modelId}/resolve/main/thumbnail.png`,
    categories: [m.pipeline_tag||'model'], readTime: 3, source: 'huggingface'
  }));
}

// ── API 15: PapersWithCode (latest ML papers) ──
async function fetchPapersWithCode() {
  const url = `https://paperswithcode.com/api/v1/papers/?ordering=-published&items_per_page=15`;
  const res = await fetch(url, { signal: AbortSignal.timeout(12000) });
  if (!res.ok) throw new Error(`PapersWithCode ${res.status}`);
  const data = await res.json();
  if (!data.results?.length) throw new Error('PapersWithCode: 0 papers');
  return data.results.map(p => ({
    title: p.title,
    link: p.url_pdf || `https://paperswithcode.com${p.url_abs||''}`,
    author: (p.authors||[]).slice(0,2).join(', ') || 'PapersWithCode',
    pubDate: p.published,
    description: (p.abstract||'').slice(0,220),
    thumb: '', categories: ['research','ml','paper'], readTime: 8, source: 'pwc'
  }));
}

// ── API 16: arXiv RSS (cs.AI, cs.LG, cs.CL) ──
async function fetchArxiv(cat='cs.AI') {
  const rssUrl = encodeURIComponent(`https://rss.arxiv.org/rss/${cat}`);
  const url = `https://api.rss2json.com/v1/api.json?rss_url=${rssUrl}&count=15`;
  const res = await fetch(url, { signal: AbortSignal.timeout(12000) });
  if (!res.ok) throw new Error(`arXiv ${res.status}`);
  const data = await res.json();
  if (data.status !== 'ok' || !data.items?.length) throw new Error('arXiv: 0 papers');
  return data.items.map(a => ({
    title: a.title?.replace(/\n/g,' '), link: a.link,
    author: a.author || 'arXiv',
    pubDate: a.pubDate,
    description: (a.description||'').replace(/<[^>]+>/g,'').slice(0,220),
    thumb: '', categories: ['research','paper', cat],
    readTime: 10, source: 'arxiv'
  }));
}

// ── API 17: TVMaze — trending/popular shows (no key) ──
async function fetchTVMaze() {
  const url = `https://api.tvmaze.com/shows?page=0`;
  const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error(`TVMaze ${res.status}`);
  const data = await res.json();
  if (!data?.length) throw new Error('TVMaze: 0 shows');
  const sorted = data.filter(s=>s.rating?.average).sort((a,b)=>(b.rating?.average||0)-(a.rating?.average||0)).slice(0,15);
  return sorted.map(s => ({
    title: `📺 ${s.name} ${s.rating?.average ? `· ★${s.rating.average}` : ''}`,
    link: s.officialSite || s.url,
    author: s.network?.name || s.webChannel?.name || 'TVMaze',
    pubDate: s.premiered ? `${s.premiered}T00:00:00Z` : new Date().toISOString(),
    description: (s.summary||'').replace(/<[^>]+>/g,'').slice(0,220),
    thumb: s.image?.medium || '',
    categories: s.genres || ['tv'], readTime: 3, source: 'tvmaze'
  }));
}

// ── API 18: RAWG — trending games (free, proxied; no key required) ──
async function fetchRAWG() {
  const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent('https://api.rawg.io/api/games?ordering=-rating&page_size=15')}`;
  const res = await fetch(proxyUrl, { signal: AbortSignal.timeout(14000) });
  if (!res.ok) throw new Error(`RAWG proxy ${res.status}`);
  const wrapper = await res.json();
  let parsed; try { parsed = JSON.parse(wrapper.contents); } catch(e) { throw new Error('RAWG parse error'); }
  if (!parsed.results?.length) throw new Error('RAWG: 0 games');
  return parsed.results.slice(0,15).map(g => ({
    title: `🎮 ${g.name}`,
    link: `https://rawg.io/games/${g.slug}`,
    author: (g.publishers||[{}])[0]?.name || 'RAWG',
    pubDate: g.released ? `${g.released}T00:00:00Z` : new Date().toISOString(),
    description: `⭐ ${g.rating?.toFixed(1)||'N/A'}/5 · 🏷️ ${(g.genres||[]).map(x=>x.name).join(', ')} · Metacritic: ${g.metacritic||'N/A'}`,
    thumb: g.background_image || '',
    categories: (g.genres||[]).map(x=>x.name), readTime: 2, source: 'rawg'
  }));
}

// ── API 19: RemoteOK — remote jobs (no key) ──
async function fetchRemoteOK() {
  const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent('https://remoteok.com/api')}`;
  const res = await fetch(proxyUrl, { signal: AbortSignal.timeout(14000) });
  if (!res.ok) throw new Error(`RemoteOK proxy ${res.status}`);
  const wrapper = await res.json();
  let parsed; try { parsed = JSON.parse(wrapper.contents); } catch(e) { throw new Error('RemoteOK parse error'); }
  const jobs = (Array.isArray(parsed) ? parsed : []).filter(j => j.position).slice(0, 20);
  if (!jobs.length) throw new Error('RemoteOK: 0 jobs');
  return jobs.map(j => ({
    title: `💼 ${j.position} @ ${j.company||'Remote'}`,
    link: j.url || `https://remoteok.com/remote-jobs/${j.id}`,
    author: j.company || 'RemoteOK',
    pubDate: j.date || new Date().toISOString(),
    description: `💰 ${j.salary||'Negotiable'} · 🏷️ ${(j.tags||[]).slice(0,4).join(', ')}`,
    thumb: j.company_logo || '',
    categories: j.tags || ['remote','jobs'], readTime: 2, source: 'remoteok'
  }));
}

// ── API 20: Binance — top crypto prices (no key) ──
async function fetchBinanceSignals() {
  const symbols = ['BTCUSDT','ETHUSDT','BNBUSDT','SOLUSDT','XRPUSDT','ADAUSDT','DOGEUSDT','AVAXUSDT','DOTUSDT','LINKUSDT'];
  const url = `https://api.binance.com/api/v3/ticker/24hr?symbols=${JSON.stringify(symbols)}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error(`Binance ${res.status}`);
  const data = await res.json();
  return data.map(t => {
    const chg = parseFloat(t.priceChangePercent)||0;
    return { symbol: t.symbol.replace('USDT',''), name: t.symbol.replace('USDT',''), price: parseFloat(t.lastPrice), change: chg, signal: signalLabel(chg,3,-3) };
  });
}

// ── API 21: CoinCap — crypto prices (no key) ──
async function fetchCoinCapSignals() {
  const url = `https://api.coincap.io/v2/assets?limit=10`;
  const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error(`CoinCap ${res.status}`);
  const data = await res.json();
  return (data.data||[]).map(c => {
    const chg = parseFloat(c.changePercent24Hr)||0;
    return { symbol: c.symbol, name: c.name, price: parseFloat(c.priceUsd), change: chg, signal: signalLabel(chg,3,-3) };
  });
}

// ── API 22: Alternative.me Fear & Greed Index ──
async function fetchFearGreed() {
  const url = `https://api.alternative.me/fng/?limit=1`;
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`F&G ${res.status}`);
  const data = await res.json();
  const d = data.data?.[0];
  if (!d) throw new Error('F&G: no data');
  return [{ symbol:'F&G', name:'Fear & Greed', price: parseInt(d.value), change: null, signal: parseInt(d.value)>60?'BUY':parseInt(d.value)<40?'SELL':'HOLD', fgLabel: d.value_classification }];
}

// ── API 23: Forex rates via open.er-api.com (proxied through allorigins) ──
async function fetchExchangeRateHost() {
  const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent('https://open.er-api.com/v6/latest/USD')}`;
  const res = await fetch(proxyUrl, { signal: AbortSignal.timeout(12000) });
  if (!res.ok) throw new Error(`ER-API ${res.status}`);
  const wrapper = await res.json();
  let parsed; try { parsed = JSON.parse(wrapper.contents); } catch(e) { throw new Error('ER-API parse'); }
  const rates = parsed.rates || {};
  const pairs = ['EUR','GBP','JPY','CHF','AUD','CAD','NZD','SGD'];
  return pairs.filter(p=>rates[p]).map(p => ({
    symbol:`USD/${p}`, price: rates[p], change: null, isForex: true, signal: 'HOLD'
  }));
}

// ── API 24: Commodity signals (Gold/Silver/Oil via open sources) ──
async function fetchCommoditySignals() {
  // Use metals.live free endpoint for gold/silver
  const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent('https://api.metals.live/v1/spot')}`;
  const res = await fetch(proxyUrl, { signal: AbortSignal.timeout(12000) });
  if (!res.ok) throw new Error(`metals.live ${res.status}`);
  const wrapper = await res.json();
  let data; try { data = JSON.parse(wrapper.contents); } catch(e) { throw new Error('metals parse'); }
  const out = [];
  if (data.gold) out.push({ symbol:'XAU', name:'Gold (oz)', price: data.gold, change: null, signal: 'HOLD' });
  if (data.silver) out.push({ symbol:'XAG', name:'Silver (oz)', price: data.silver, change: null, signal: 'HOLD' });
  if (data.platinum) out.push({ symbol:'XPT', name:'Platinum', price: data.platinum, change: null, signal: 'HOLD' });
  if (data.palladium) out.push({ symbol:'XPD', name:'Palladium', price: data.palladium, change: null, signal: 'HOLD' });
  return out;
}
async function fetchIGN() {
  const rssUrl = encodeURIComponent('https://feeds.ign.com/ign/all');
  const url = `https://api.rss2json.com/v1/api.json?rss_url=${rssUrl}&count=15`;
  const res = await fetch(url, { signal: AbortSignal.timeout(12000) });
  if (!res.ok) throw new Error(`IGN RSS ${res.status}`);
  const data = await res.json();
  if (data.status !== 'ok' || !data.items?.length) throw new Error('IGN: 0 articles');
  return data.items.map(a => ({
    title: a.title, link: a.link,
    author: a.author || 'IGN',
    pubDate: a.pubDate,
    description: (a.description || '').replace(/<[^>]+>/g, '').slice(0, 200),
    thumb: a.thumbnail || '',
    categories: a.categories || [],
    readTime: Math.max(2, Math.ceil(((a.content || '').split(' ').length) / 200)),
    source: 'ign'
  }));
}
// ══════════════════════════════════════════

const SIGNALS_CATS = new Set(['blockchain','stocks','forex','commodities']);

async function loadSignals() {
  const panel = document.getElementById('signalsPanel');
  if (!SIGNALS_CATS.has(currentTag)) { panel.style.display = 'none'; return; }
  panel.style.display = 'block';
  const con = document.getElementById('signalsContainer');
  const titleEl = document.getElementById('signalsTitle');
  con.innerHTML = `<div class="signals-loading"><div class="live-dot" style="background:var(--accent)"></div> Fetching live data…</div>`;
  try {
    let signals = [];
    if (currentTag === 'blockchain') {
      titleEl.textContent = '🪙 Crypto Signals';
      // Try Binance first (more reliable, no key), fall back to CoinGecko
      try { signals = await fetchBinanceSignals(); }
      catch(e) {
        console.warn('Binance failed, trying CoinCap…');
        try { signals = await fetchCoinCapSignals(); }
        catch(e2) { signals = await fetchCryptoSignals(); }
      }
      // Append Fear & Greed index
      try { const fg = await fetchFearGreed(); signals = [...signals, ...fg]; } catch(e){}
    } else if (currentTag === 'stocks') {
      titleEl.textContent = '📈 Stock Signals';
      signals = await fetchStockSignals();
    } else if (currentTag === 'forex') {
      titleEl.textContent = '💱 Forex Signals';
      // Try ExchangeRate.host first, fall back to Frankfurter
      try { signals = await fetchExchangeRateHost(); }
      catch(e) { signals = await fetchForexSignals(); }
    } else if (currentTag === 'commodities') {
      titleEl.textContent = '🥇 Commodity Prices';
      signals = await fetchCommoditySignals();
    }
    document.getElementById('signalsTime').textContent = new Date().toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit'});
    renderSignals(signals);
  } catch(e) {
    con.innerHTML = `<div class="signals-error">⚠️ Could not load signals: ${e.message}</div>`;
  }
}

function signalLabel(chg, thresholdHigh=2, thresholdLow=-2) {
  if (chg >= thresholdHigh) return 'BUY';
  if (chg <= thresholdLow) return 'SELL';
  if (chg > 0.3) return 'WATCH';
  return 'HOLD';
}

function renderSignals(signals) {
  const con = document.getElementById('signalsContainer');
  if (!signals.length) { con.innerHTML = `<div class="signals-error">No signal data available.</div>`; return; }
  con.innerHTML = signals.map(s => {
    const hasChg = s.change !== null && s.change !== undefined && !isNaN(s.change);
    const chgClass = hasChg ? (s.change > 0.05 ? 'up' : s.change < -0.05 ? 'down' : 'flat') : 'flat';
    const chgStr = hasChg ? `${s.change >= 0 ? '▲' : '▼'} ${Math.abs(s.change).toFixed(2)}%` : '—';
    const badge = s.signal === 'BUY' ? 'sig-buy' : s.signal === 'SELL' ? 'sig-sell' : s.signal === 'WATCH' ? 'sig-watch' : 'sig-hold';
    return `<div class="signal-card">
      <div class="signal-sym">${esc(s.symbol)}</div>
      ${s.name ? `<div class="signal-name">${esc(s.name)}</div>` : ''}
      <div class="signal-price">${formatSignalPrice(s)}</div>
      <div class="signal-change ${chgClass}">${chgStr}</div>
      <span class="signal-badge ${badge}">${esc(s.signal)}</span>
    </div>`;
  }).join('');
}

function formatSignalPrice(s) {
  if (s.price === undefined || s.price === null) return '—';
  if (s.isForex) {
    if (s.symbol.includes('JPY')) return s.price.toFixed(2);
    return s.price.toFixed(4);
  }
  if (s.price >= 10000) return '$' + s.price.toLocaleString('en-US',{minimumFractionDigits:0,maximumFractionDigits:0});
  if (s.price >= 100) return '$' + s.price.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
  if (s.price >= 1) return '$' + s.price.toFixed(2);
  if (s.price >= 0.001) return '$' + s.price.toFixed(4);
  return '$' + s.price.toFixed(6);
}

// ── Crypto signals via CoinGecko (free, no key) ──
async function fetchCryptoSignals() {
  const ids = 'bitcoin,ethereum,binancecoin,solana,ripple,cardano,dogecoin,polkadot,avalanche-2,chainlink';
  const url = `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${ids}&order=market_cap_desc&sparkline=false`;
  const res = await fetch(url, { signal: AbortSignal.timeout(12000) });
  if (!res.ok) throw new Error(`CoinGecko ${res.status}`);
  const data = await res.json();
  if (!data.length) throw new Error('CoinGecko returned 0 coins');
  return data.map(c => {
    const chg = c.price_change_percentage_24h || 0;
    return { symbol: c.symbol.toUpperCase(), name: c.name, price: c.current_price, change: chg, signal: signalLabel(chg, 3, -3) };
  });
}

// ── Stock signals via Yahoo Finance (via allorigins proxy) ──
async function fetchStockSignals() {
  const symbols = ['AAPL','MSFT','GOOGL','AMZN','META','TSLA','NVDA','AMD','SPY','QQQ'];
  const yfUrl = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${symbols.join(',')}`;
  const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(yfUrl)}`;
  const res = await fetch(proxyUrl, { signal: AbortSignal.timeout(18000) });
  if (!res.ok) throw new Error(`Proxy HTTP ${res.status}`);
  const wrapper = await res.json();
  let parsed;
  try { parsed = JSON.parse(wrapper.contents); } catch(e) { throw new Error('Invalid stock data'); }
  const results = parsed?.quoteResponse?.result || [];
  if (!results.length) throw new Error('No stock quotes returned');
  return results.map(q => {
    const chg = q.regularMarketChangePercent || 0;
    return { symbol: q.symbol, name: (q.shortName||q.displayName||q.symbol).slice(0,18), price: q.regularMarketPrice, change: chg, signal: signalLabel(chg, 1.5, -1.5) };
  });
}

// ── Forex signals via Frankfurter API (free, no key, historical) ──
async function fetchForexSignals() {
  const today = new Date();
  const weekAgo = new Date(+today - 7*24*60*60*1000);
  const fmt = d => d.toISOString().split('T')[0];
  const symbols = 'EUR,GBP,JPY,CHF,AUD,CAD,NZD,SGD';
  const url = `https://api.frankfurter.app/${fmt(weekAgo)}..${fmt(today)}?base=USD&symbols=${symbols}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(12000) });
  if (!res.ok) throw new Error(`Frankfurter ${res.status}`);
  const data = await res.json();
  const dates = Object.keys(data.rates).sort();
  if (dates.length < 2) throw new Error('Insufficient forex history');
  const latest = data.rates[dates[dates.length-1]];
  const prev = data.rates[dates[0]];
  return Object.keys(latest).map(pair => {
    const curr = latest[pair], old = prev[pair];
    const chg = old ? ((curr - old) / old) * 100 : 0;
    return { symbol: `USD/${pair}`, price: curr, change: chg, isForex: true, signal: signalLabel(chg, 0.7, -0.7) };
  });
}
// ══════════════════════════════════════════
// ── ENTERTAINMENT: LOCAL MOVIES & ATTRACTIONS ──
// Uses Google Places API (Text Search & Nearby Search via Places API)
// ══════════════════════════════════════════

// ── ENTERTAINMENT SHOWCASE (no API key required) ──

function showEntPanel(show) {
  const panel = document.getElementById('entertainmentPanel');
  if (panel) panel.style.display = show ? 'block' : 'none';
}

function handleEntertainmentTab(show) {
  showEntPanel(show);
  if (show) loadEntShowcasePlatform(currentEntPlatform);
}

// ── Fetch: TVMaze Today's TV Schedule ──
async function fetchTVScheduleToday() {
  const today = new Date().toISOString().slice(0,10);
  const url = `https://api.tvmaze.com/schedule?country=US&date=${today}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error(`TVMaze schedule ${res.status}`);
  const data = await res.json();
  if (!data?.length) throw new Error('No schedule');
  // Filter to shows with images and good ratings, dedupe by show name
  const seen = new Set();
  return data
    .filter(ep => ep.show?.image && ep.show?.rating?.average >= 7 && !seen.has(ep.show.id) && seen.add(ep.show.id))
    .slice(0, 12)
    .map(ep => ({
      name: ep.show.name,
      link: ep.show.officialSite || ep.show.url || `https://www.tvmaze.com/shows/${ep.show.id}`,
      img: ep.show.image?.medium || '',
      rating: ep.show.rating?.average || null,
      meta: `${ep.airtime ? ep.airtime + ' · ' : ''}${ep.show.network?.name || ep.show.webChannel?.name || ''}`,
      genre: (ep.show.genres||[]).slice(0,2).join(', ') || 'TV'
    }));
}

// ── Fetch: Archive.org Popular Free Movies ──
async function fetchArchiveMovies() {
  const url = `https://archive.org/advancedsearch.php?q=mediatype%3Amovies+AND+subject%3A(feature+OR+film+OR+movie)&fl[]=identifier,title,description,subject,downloads,year,creator&sort[]=downloads+desc&rows=14&output=json`;
  const res = await fetch(url, { signal: AbortSignal.timeout(12000) });
  if (!res.ok) throw new Error(`Archive.org ${res.status}`);
  const data = await res.json();
  const docs = data.response?.docs || [];
  if (!docs.length) throw new Error('No archive movies');
  return docs.slice(0,12).map(m => ({
    name: m.title,
    link: `https://archive.org/details/${m.identifier}`,
    img: `https://archive.org/services/img/${m.identifier}`,
    rating: null,
    meta: m.year ? `${m.year}` : 'Free to watch',
    genre: Array.isArray(m.subject) ? m.subject.slice(0,2).join(', ') : (m.subject || 'Movie')
  }));
}

// ── Fetch: RAWG Top Rated Games ──
async function fetchRAWGShowcase() {
  const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent('https://api.rawg.io/api/games?ordering=-rating&page_size=12')}`;
  const res = await fetch(proxyUrl, { signal: AbortSignal.timeout(14000) });
  if (!res.ok) throw new Error(`RAWG proxy ${res.status}`);
  const wrapper = await res.json();
  let parsed; try { parsed = JSON.parse(wrapper.contents); } catch(e) { throw new Error('RAWG parse error'); }
  if (!parsed.results?.length) throw new Error('RAWG 0 games');
  return parsed.results.slice(0,12).map(g => ({
    name: g.name,
    link: `https://rawg.io/games/${g.slug}`,
    img: g.background_image || '',
    rating: g.rating ? parseFloat(g.rating.toFixed(1)) : null,
    meta: g.released ? g.released.slice(0,4) : '',
    genre: (g.genres||[]).slice(0,2).map(x=>x.name).join(', ') || 'Game',
    isGame: true
  }));
}

// ── Render Entertainment Showcase ──
async function loadEntShowcase() {
  const con = document.getElementById('entContent');
  if (!con) return;
  con.innerHTML = `<div style="display:flex;align-items:center;gap:.5rem;padding:.85rem 1.1rem;font-size:.78rem;color:var(--text-muted)"><div class="live-dot" style="background:var(--accent)"></div>Loading entertainment…</div>`;

  const [tvResult, moviesResult, gamesResult] = await Promise.allSettled([
    fetchTVScheduleToday(),
    fetchArchiveMovies(),
    fetchRAWGShowcase()
  ]);

  let html = '';

  if (tvResult.status === 'fulfilled' && tvResult.value.length) {
    html += `<div class="ent-section-title">📺 On TV Today</div>
      <div class="ent-cards-row">${tvResult.value.map(item => renderShowcaseCard(item, '📺')).join('')}</div>`;
  }

  if (moviesResult.status === 'fulfilled' && moviesResult.value.length) {
    html += `<div class="ent-section-title">🎬 Free Movies — Archive.org</div>
      <div class="ent-cards-row">${moviesResult.value.map(item => renderShowcaseCard(item, '🎬')).join('')}</div>`;
  }

  if (gamesResult.status === 'fulfilled' && gamesResult.value.length) {
    html += `<div class="ent-section-title">🎮 Top Rated Games</div>
      <div class="ent-cards-row">${gamesResult.value.map(item => renderShowcaseCard(item, '🎮')).join('')}</div>`;
  }

  if (!html) {
    html = `<div class="ent-error">⚠️ Could not load entertainment data. Check your network and try again.
      <br><br><button class="ent-permission-btn" style="font-size:.75rem;padding:.45rem .9rem" onclick="loadEntShowcase()">↺ Retry</button></div>`;
  }

  con.innerHTML = html;
}

function renderShowcaseCard(item, fallbackEmoji) {
  const stars = item.rating ? `★ ${item.rating}` : '';
  return `<a href="${esc(item.link)}" target="_blank" rel="noopener" class="ent-card">
    <div class="ent-card-imgwrap">
      ${item.img
        ? `<img src="${esc(item.img)}" alt="" loading="lazy" onerror="this.parentElement.innerHTML='<span style=font-size:2rem>${fallbackEmoji}</span>'">`
        : `<span style="font-size:2rem">${fallbackEmoji}</span>`}
    </div>
    <div class="ent-card-body">
      <div class="ent-card-name">${esc(item.name)}</div>
      ${stars ? `<div class="ent-card-rating">${esc(stars)}</div>` : ''}
      <div class="ent-card-meta">
        <span>${esc(item.meta)}</span>
        ${item.genre ? `<span>${esc(item.genre)}</span>` : ''}
      </div>
    </div>
  </a>`;
}

function mergeResults(...arrays) {
  const seen = new Set();
  return arrays.flat().filter(a => {
    if (!a || !a.title) return false;
    const key = a.title.toLowerCase().slice(0,60);
    if (seen.has(key)) return false;
    seen.add(key); return true;
  });
}

// ── MAIN LOAD: pick sources per category ──
async function loadArticles(tag) {
  const results = [];
  const labels = [];

  // DEV.to — tech-adjacent and education/career/llm categories
  const devToCats = new Set(['programming','ai','datascience','technology','startup','design','science','health','finance','python','javascript','security','machinelearning','blockchain','education','career','llm']);
  if (devToCats.has(tag)) {
    try { const r = await fetchDevTo(tag==='llm'?'llm':tag); results.push(...r); labels.push('DEV.to'); }
    catch(e){ console.warn('DEV.to:', e.message); }
  }

  // HN — all categories
  try { const r = await fetchHN(HN_MAP[tag]||tag); results.push(...r); labels.push('HN'); }
  catch(e){ console.warn('HN:', e.message); }

  // Reddit primary subreddit
  if (REDDIT_MAP[tag]) {
    try { const r = await fetchReddit(REDDIT_MAP[tag]); results.push(...r); labels.push(`r/${REDDIT_MAP[tag]}`); }
    catch(e){ console.warn('Reddit primary:', e.message); }
  }

  // Reddit secondary subreddit (for richer coverage)
  if (REDDIT_MAP2[tag]) {
    try { const r = await fetchReddit(REDDIT_MAP2[tag]); results.push(...r); }
    catch(e){ console.warn('Reddit secondary:', e.message); }
  }

  // Medium — selected categories
  if (MEDIUM_MAP[tag]) {
    try { const r = await fetchMedium(MEDIUM_MAP[tag]); results.push(...r); labels.push('Medium'); }
    catch(e){ console.warn('Medium:', e.message); }
  }

  // XDA — tech categories only
  if (XDA_CATS.has(tag)) {
    try { const r = await fetchXDA(); results.push(...r); labels.push('XDA'); }
    catch(e){ console.warn('XDA:', e.message); }
  }

  // freeCodeCamp — education and career categories
  const fccCats = new Set(['education','career','programming','python','javascript']);
  if (fccCats.has(tag)) {
    try { const r = await fetchFreeCodeCamp(); results.push(...r); labels.push('freeCodeCamp'); }
    catch(e){ console.warn('FCC:', e.message); }
  }

  // HN Jobs — direct job board listings
  if (tag === 'jobs') {
    try { const r = await fetchHNJobs(); results.push(...r); labels.push('HN Jobs'); }
    catch(e){ console.warn('HN Jobs:', e.message); }
  }

  // TechCrunch — startup, ai, technology, security
  const tcCats = new Set(['startup','ai','technology','security','blockchain','machinelearning']);
  if (tcCats.has(tag)) {
    try { const r = await fetchTechCrunch(); results.push(...r); labels.push('TechCrunch'); }
    catch(e){ console.warn('TechCrunch:', e.message); }
  }

  // The Guardian — science, health, world news, finance, education
  const guardianMap = { science:'science', health:'society/health', finance:'business', education:'education', technology:'technology', startup:'business', career:'careers', research:'science' };
  if (guardianMap[tag]) {
    try { const r = await fetchGuardian(guardianMap[tag]); results.push(...r); labels.push('Guardian'); }
    catch(e){ console.warn('Guardian:', e.message); }
  }

  // GitHub Trending — programming, ai, python, javascript, security, llm
  const githubLangMap = { programming:'', python:'Python', javascript:'JavaScript', security:'', ai:'', llm:'', machinelearning:'' };
  if (tag in githubLangMap) {
    try { const r = await fetchGitHubTrending(githubLangMap[tag]); results.push(...r); labels.push('GitHub'); }
    catch(e){ console.warn('GitHub:', e.message); }
  }

  // HuggingFace — ai, llm, machinelearning, research, datascience
  const hfCats = new Set(['ai','llm','machinelearning','research','datascience']);
  if (hfCats.has(tag)) {
    try { const r = await fetchHuggingFace(); results.push(...r); labels.push('HuggingFace'); }
    catch(e){ console.warn('HuggingFace:', e.message); }
  }

  // PapersWithCode — ai, llm, machinelearning, research, datascience
  if (hfCats.has(tag)) {
    try { const r = await fetchPapersWithCode(); results.push(...r); labels.push('PapersWithCode'); }
    catch(e){ console.warn('PwC:', e.message); }
  }

  // arXiv — research, llm, ai, science, datascience
  const arxivMap = { research:'cs.AI', llm:'cs.CL', ai:'cs.AI', machinelearning:'cs.LG', datascience:'stat.ML', science:'q-bio' };
  if (arxivMap[tag]) {
    try { const r = await fetchArxiv(arxivMap[tag]); results.push(...r); labels.push('arXiv'); }
    catch(e){ console.warn('arXiv:', e.message); }
  }

  // TVMaze — entertainment
  if (tag === 'entertainment') {
    try { const r = await fetchTVMaze(); results.push(...r); labels.push('TVMaze'); }
    catch(e){ console.warn('TVMaze:', e.message); }
  }

  // RAWG — gaming
  if (tag === 'gaming') {
    try { const r = await fetchRAWG(); results.push(...r); labels.push('RAWG'); }
    catch(e){ console.warn('RAWG:', e.message); }
  }

  // RemoteOK — remotejobs
  if (tag === 'remotejobs') {
    try { const r = await fetchRemoteOK(); results.push(...r); labels.push('RemoteOK'); }
    catch(e){ console.warn('RemoteOK:', e.message); }
  }
  if (tag === 'entertainment') {
    try { const r = await fetchVerge(); results.push(...r); labels.push('The Verge'); }
    catch(e){ console.warn('Verge:', e.message); }
    // IGN Entertainment RSS
    try { const r = await fetchIGN(); results.push(...r); labels.push('IGN'); }
    catch(e){ console.warn('IGN:', e.message); }
    // Variety / Entertainment Weekly via HN search
    try { const r = await fetchHN('movies TV shows entertainment film'); results.push(...r); }
    catch(e){ console.warn('HN entertainment:', e.message); }
  }

  // Ars Technica RSS — LLM deep-dives, tech science
  if (tag === 'llm' || tag === 'ai') {
    try { const r = await fetchArsTechnica(); results.push(...r); labels.push('Ars Technica'); }
    catch(e){ console.warn('Ars:', e.message); }
  }

  const merged = mergeResults(results);
  if (!merged.length) throw new Error('No articles found from any source');

  document.getElementById('sourceLabel').textContent = labels.join(' · ');
  return merged;
}

// ── HELPERS ──
function getInitials(n){return(n||'?').split(' ').map(w=>w[0]||'').join('').slice(0,2).toUpperCase();}
// HTML-escape for safe insertion into innerHTML (text or attribute contexts)
function esc(s){
  if(s===null||s===undefined)return'';
  return String(s)
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;')
    .replace(/'/g,'&#39;');
}
function timeAgo(s){
  if(!s)return'';
  const d=new Date(s),diff=(Date.now()-d)/1000;
  if(isNaN(diff))return'';
  if(diff<3600)return Math.max(1,Math.floor(diff/60))+'m ago';
  if(diff<86400)return Math.floor(diff/3600)+'h ago';
  if(diff<604800)return Math.floor(diff/86400)+'d ago';
  return d.toLocaleDateString('en-US',{month:'short',day:'numeric'});
}
function isBookmarked(url){return bookmarks.some(b=>b.link===url);}
function isRead(url){return readHistory.some(r=>r.link===url);}
function saveBookmarks(){localStorage.setItem('gn_bookmarks',JSON.stringify(bookmarks));}
function saveHistory(){localStorage.setItem('gn_history',JSON.stringify(readHistory));}

function toggleBookmark(e,item){
  e.preventDefault();e.stopPropagation();
  if(isBookmarked(item.link)){bookmarks=bookmarks.filter(b=>b.link!==item.link);showToast('Removed from saved');}
  else{bookmarks.unshift({title:item.title,link:item.link,author:item.author,pubDate:item.pubDate,thumb:item.thumb,readTime:item.readTime,source:item.source});if(bookmarks.length>50)bookmarks.pop();showToast('📖 Saved!');}
  saveBookmarks();updateMeta();
  document.querySelectorAll(`[data-bm="${CSS.escape(item.link)}"]`).forEach(el=>{
    el.classList.toggle('bookmarked',isBookmarked(item.link));
    el.title=isBookmarked(item.link)?'Remove bookmark':'Save article';
  });
}

function markRead(item){
  if(!isRead(item.link)){readHistory.unshift({title:item.title,link:item.link});if(readHistory.length>30)readHistory.pop();saveHistory();updateMeta();renderHistory();}
}

function showToast(msg,dur=2200){
  const t=document.getElementById('toast');t.textContent=msg;t.classList.add('show');
  clearTimeout(t._to);t._to=setTimeout(()=>t.classList.remove('show'),dur);
}

function onSearch(val){
  searchQuery=val.trim().toLowerCase();
  document.getElementById('searchClear').style.display=val?'block':'none';
  const mClear=document.getElementById('searchClearMobile');if(mClear)mClear.style.display=val?'block':'none';
  applyFilters();
}
function clearSearch(){
  document.getElementById('searchInput').value='';
  const mobile=document.getElementById('searchInputMobile');if(mobile)mobile.value='';
  document.getElementById('searchClear').style.display='none';
  const mClear=document.getElementById('searchClearMobile');if(mClear)mClear.style.display='none';
  searchQuery='';applyFilters();
}
function applySort(){sortMode=document.getElementById('sortSelect').value;applyFilters();}

function applyFilters(){
  if(currentTag==='__saved__'){renderSaved();return;}
  let items=[...allArticles];
  if(searchQuery){items=items.filter(a=>a.title.toLowerCase().includes(searchQuery)||a.author.toLowerCase().includes(searchQuery)||(a.categories||[]).some(c=>c.toLowerCase().includes(searchQuery)));}
  if(sortMode==='oldest')items.sort((a,b)=>new Date(a.pubDate)-new Date(b.pubDate));
  else if(sortMode==='newest')items.sort((a,b)=>new Date(b.pubDate)-new Date(a.pubDate));
  else if(sortMode==='readtime')items.sort((a,b)=>a.readTime-b.readTime);
  renderArticles(items,searchQuery?`Results for "${searchQuery}"`:`Latest · ${currentLabel}`);
  document.getElementById('countPill').textContent=`${items.length} article${items.length!==1?'s':''}`;
}

function srcBadge(src){
  const map={
    hn:`<span class="source-badge hn-badge">🟠 HN</span>`,
    devto:`<span class="source-badge">🔷 DEV</span>`,
    reddit:`<span class="source-badge reddit-badge">🤍 Reddit</span>`,
    medium:`<span class="source-badge medium-badge">〇 Medium</span>`,
    xda:`<span class="source-badge xda-badge">⚡ XDA</span>`,
    fcc:`<span class="source-badge fcc-badge">🟢 FCC</span>`,
    hnjobs:`<span class="source-badge hnjobs-badge">🟠 HN Jobs</span>`,
    verge:`<span class="source-badge verge-badge">🔺 Verge</span>`,
    ars:`<span class="source-badge hn-badge">🛸 Ars</span>`,
    ign:`<span class="source-badge ign-badge">🎮 IGN</span>`,
    google:`<span class="source-badge google-badge">🗺️ Google</span>`,
    techcrunch:`<span class="source-badge" style="background:rgba(20,133,91,.12);color:#0d7f5a;border-color:rgba(20,133,91,.28)">🟩 TC</span>`,
    guardian:`<span class="source-badge" style="background:rgba(0,61,99,.1);color:#003d63;border-color:rgba(0,61,99,.22)">🔵 Guardian</span>`,
    github:`<span class="source-badge" style="background:rgba(36,41,46,.1);color:#24292e;border-color:rgba(36,41,46,.22)">🐙 GitHub</span>`,
    huggingface:`<span class="source-badge" style="background:rgba(255,200,0,.14);color:#8a6000;border-color:rgba(255,200,0,.32)">🤗 HF</span>`,
    pwc:`<span class="source-badge" style="background:rgba(100,149,237,.12);color:#2244aa;border-color:rgba(100,149,237,.28)">📄 PwC</span>`,
    arxiv:`<span class="source-badge" style="background:rgba(180,0,0,.1);color:#990000;border-color:rgba(180,0,0,.22)">📐 arXiv</span>`,
    tvmaze:`<span class="source-badge" style="background:rgba(255,120,0,.1);color:#b85c00;border-color:rgba(255,120,0,.25)">📺 TVMaze</span>`,
    rawg:`<span class="source-badge" style="background:rgba(50,205,50,.1);color:#1a6b1a;border-color:rgba(50,205,50,.25)">🎮 RAWG</span>`,
    remoteok:`<span class="source-badge" style="background:rgba(0,200,150,.1);color:#007a5a;border-color:rgba(0,200,150,.25)">🌍 RemoteOK</span>`,
    bbc:`<span class="source-badge bbc-badge">🔴 BBC</span>`,
    aljazeera:`<span class="source-badge aljazeera-badge">🟡 AJ</span>`,
    npr:`<span class="source-badge npr-badge">🎙️ NPR</span>`,
    imdb:`<span class="source-badge" style="background:rgba(245,197,24,.15);color:#a07000;border-color:rgba(245,197,24,.35)">⭐ IMDb</span>`
  };
  return map[src]||`<span class="source-badge">📰 News</span>`;
}

// Centralized lookup buffer for currently-rendered items (used by inline handlers
// instead of serializing whole objects into HTML attributes — safer & faster).
let _renderItems = [];
function _itemAt(idx){return _renderItems[idx];}
function _actMarkRead(idx){const it=_itemAt(idx);if(it)markRead(it);}
function _actBookmark(e,idx){const it=_itemAt(idx);if(it)toggleBookmark(e,it);}
function _actShare(e,idx){const it=_itemAt(idx);if(it)shareArticle(e,it.title,it.link);}
function _actUnsave(e,idx){const it=_itemAt(idx);if(it){toggleBookmark(e,it);setTimeout(()=>renderSaved(),50);} }

function renderArticles(items, headingText='Latest Articles'){
  document.getElementById('sectionTitle').textContent=headingText;
  const con=document.getElementById('articlesContainer');
  if(!items.length){con.innerHTML=`<div class="empty-box"><div style="font-size:2rem;margin-bottom:.5rem">🔍</div>No articles found.<br>Try a different search or topic.</div>`;_renderItems=[];return;}
  _renderItems=items.slice();
  const featured=items[0];
  const rest=items.slice(1,30);
  const fLink=esc(featured.link), fTitle=esc(featured.title);
  const fDescRaw=String(featured.description||'');
  const fDesc=esc(fDescRaw.slice(0,220))+(fDescRaw.length>220?'…':'');
  const fAuthor=esc(featured.author);

  let html=`<a href="${fLink}" target="_blank" rel="noopener" class="featured-card" style="animation-delay:.05s" onclick="_actMarkRead(0)">`;
  if(featured.thumb) html+=`<img class="feat-img" src="${esc(featured.thumb)}" alt="" loading="lazy" onerror="this.outerHTML='<div class=feat-img-ph>📰</div>'">`;
  else html+=`<div class="feat-img-ph">📰</div>`;
  html+=`<div class="feat-body">
    <div style="display:flex;align-items:center;gap:.5rem;margin-bottom:.6rem">
      <div class="article-tag">${esc(currentLabel.replace(/^[^\s]+\s/,''))}</div>
      ${srcBadge(featured.source)}
    </div>
    <div class="feat-title">${fTitle}</div>
    <div class="feat-desc">${fDesc}</div>
    <div class="article-meta">
      <div class="av">${esc(getInitials(featured.author))}</div>
      <div class="meta-info">
        <div class="author-name">${fAuthor}</div>
        <div class="meta-sub"><span>${timeAgo(featured.pubDate)}</span><span>·</span><span>${featured.readTime} min read</span>${isRead(featured.link)?'<span class="read-badge">Read</span>':''}</div>
      </div>
      <div class="meta-actions">
        <button class="act-btn ${isBookmarked(featured.link)?'bookmarked':''}" data-bm="${fLink}" title="${isBookmarked(featured.link)?'Remove':'Save'}" onclick="_actBookmark(event,0)">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="${isBookmarked(featured.link)?'currentColor':'none'}" stroke="currentColor" stroke-width="2"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>
        </button>
        <button class="act-btn" title="Share" onclick="_actShare(event,0)">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
        </button>
      </div>
    </div>
  </div></a>`;

  html+=`<div class="article-list">`;
  rest.forEach((item,i)=>{
    const idx=i+1; // index in _renderItems (featured occupies 0)
    const delay=idx*0.04;
    const link=esc(item.link), title=esc(item.title), author=esc(item.author);
    html+=`<a href="${link}" target="_blank" rel="noopener" class="article-card${isRead(item.link)?' read':''}" style="animation-delay:${delay}s" onclick="_actMarkRead(${idx})">
      <div class="art-num">${String(i+1).padStart(2,'0')}</div>
      <div class="art-content">
        <div class="article-title">${title}</div>
        <div class="art-meta">
          ${srcBadge(item.source)}
          <span>${author}</span><span>·</span><span>${timeAgo(item.pubDate)}</span><span>·</span><span>${item.readTime}min</span>
          ${isRead(item.link)?'<span class="read-badge">✓ Read</span>':''}
        </div>
      </div>
      <div class="art-actions">
        ${item.thumb?`<img class="art-thumb" src="${esc(item.thumb)}" alt="" loading="lazy" onerror="this.outerHTML='<div class=art-thumb-ph>📄</div>'">`:`<div class="art-thumb-ph">📄</div>`}
        <button class="act-btn ${isBookmarked(item.link)?'bookmarked':''}" data-bm="${link}" title="${isBookmarked(item.link)?'Remove':'Save'}" onclick="_actBookmark(event,${idx})">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="${isBookmarked(item.link)?'currentColor':'none'}" stroke="currentColor" stroke-width="2.5"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>
        </button>
      </div>
    </a>`;
  });
  html+=`</div>`;
  if(items.length>30)html+=`<button class="load-more-btn" onclick="window.open('https://www.reddit.com/r/${encodeURIComponent(REDDIT_MAP[currentTag]||currentTag)}','_blank')">View more on Reddit ↗</button>`;
  con.innerHTML=html;
}

function renderSaved(){
  document.getElementById('sectionTitle').textContent='🔖 Saved Articles';
  document.getElementById('countPill').textContent=`${bookmarks.length} saved`;
  document.getElementById('sourceLabel').textContent='Bookmarks';
  const con=document.getElementById('articlesContainer');
  if(!bookmarks.length){con.innerHTML=`<div class="saved-empty"><div class="big-icon">🔖</div>No saved articles yet.<br>Tap the bookmark icon on any article to save it here.</div>`;_renderItems=[];return;}
  _renderItems=bookmarks.slice();
  let html=`<div class="article-list">`;
  bookmarks.forEach((item,i)=>{
    const link=esc(item.link), title=esc(item.title), author=esc(item.author);
    html+=`<a href="${link}" target="_blank" rel="noopener" class="article-card" style="animation-delay:${i*0.04}s" onclick="_actMarkRead(${i})">
      <div class="art-num">${String(i+1).padStart(2,'0')}</div>
      <div class="art-content">
        <div class="article-title">${title}</div>
        <div class="art-meta">${srcBadge(item.source||'devto')}<span>${author}</span><span>·</span><span>${timeAgo(item.pubDate)}</span></div>
      </div>
      <div class="art-actions">
        ${item.thumb?`<img class="art-thumb" src="${esc(item.thumb)}" alt="" loading="lazy" onerror="this.outerHTML=''">`:'' }
        <button class="act-btn bookmarked" data-bm="${link}" title="Remove" onclick="_actUnsave(event,${i})">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2.5"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>
        </button>
      </div>
    </a>`;
  });
  html+=`</div>`;con.innerHTML=html;
}

function renderSidebar(items){
  const tagCounts={};
  items.forEach(it=>(it.categories||[]).forEach(c=>{if(c&&c.length<25)tagCounts[c]=(tagCounts[c]||0)+1;}));
  const tags=Object.entries(tagCounts).sort((a,b)=>b[1]-a[1]).slice(0,14).map(([t])=>t);
  const tagHTML=(tags.length?tags:['webdev','react','node','rust','go','docker','kubernetes'])
    .map(t=>`<span class="tag-pill" onclick="window.open('https://dev.to/t/${encodeURIComponent(t)}','_blank')">#${esc(t)}</span>`).join('');
  const tagsEl=document.getElementById('trendingTags');
  if(tagsEl)tagsEl.innerHTML=tagHTML;
  const tagsDrawer=document.getElementById('trendingTagsDrawer');
  if(tagsDrawer)tagsDrawer.innerHTML=tagHTML;

  const ac={};
  items.forEach(it=>{if(it.author)ac[it.author]=(ac[it.author]||0)+1;});
  const topA=Object.entries(ac).sort((a,b)=>b[1]-a[1]).slice(0,5);
  const authorsHTML=topA.map(([n,c])=>`
    <div class="author-item">
      <div class="author-av">${esc(getInitials(n))}</div>
      <div><div class="author-nm">${esc(n)}</div><div class="author-posts">${c} article${c>1?'s':''}</div></div>
    </div>`).join('');
  document.getElementById('topAuthors').innerHTML=authorsHTML;
  const authorsDrawer=document.getElementById('topAuthorsDrawer');
  if(authorsDrawer)authorsDrawer.innerHTML=authorsHTML||'<div style="font-size:.75rem;color:var(--text-muted)">No authors yet.</div>';

  renderHistory();
}

function renderHistory(){
  const histHTML=readHistory.length
    ?readHistory.slice(0,5).map(r=>`<div class="history-item" onclick="window.open('${esc(r.link)}','_blank')">${esc(r.title)}</div>`).join('')
    :`<div style="font-size:.75rem;color:var(--text-muted)">No history yet.</div>`;
  const el=document.getElementById('readingHistory');if(el)el.innerHTML=histHTML;
  const drawerEl=document.getElementById('readingHistoryDrawer');if(drawerEl)drawerEl.innerHTML=histHTML;
}

function updateMeta(items){
  if(items){
    document.getElementById('sArticles').textContent=items.length;
    const authors=new Set(items.map(i=>i.author).filter(Boolean));
    document.getElementById('sAuthors').textContent=authors.size;
    document.getElementById('sTopic').textContent=currentLabel.replace(/^[^\s]+\s/,'');
  }
  document.getElementById('sSaved').textContent=bookmarks.length;
  document.getElementById('sRead').textContent=readHistory.length;
  document.getElementById('sTime').textContent=new Date().toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit'});
}

function shareArticle(e,title,url){
  e.preventDefault();e.stopPropagation();
  if(navigator.share){navigator.share({title,url}).catch(()=>{});}
  else{navigator.clipboard.writeText(url).then(()=>showToast('🔗 Link copied!')).catch(()=>showToast('Copy: '+url));}
}

function showSkeletons(){
  document.getElementById('articlesContainer').innerHTML=`
    <div class="sk-card" style="margin-bottom:.85rem"><div class="skeleton sk-tall sk-full"></div><div style="margin-top:.6rem;display:flex;flex-direction:column;gap:.5rem"><div class="skeleton sk-h sk-short"></div><div class="skeleton sk-h sk-full"></div><div class="skeleton sk-h sk-med"></div></div></div>
    ${[0,1,2,3,4].map(()=>`<div class="sk-card sk-row" style="margin-bottom:.65rem"><div style="flex:1;display:flex;flex-direction:column;gap:6px;padding-top:4px"><div class="skeleton sk-h sk-full"></div><div class="skeleton sk-h sk-med"></div><div class="skeleton sk-h sk-short"></div></div><div class="skeleton sk-sq"></div></div>`).join('')}`;
}

function selectTopic(btn,tag,label){
  document.querySelectorAll('.tab-btn').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  currentTag=tag;currentLabel=label||tag;
  clearSearch();
  if(!SIGNALS_CATS.has(tag)){const p=document.getElementById('signalsPanel');if(p)p.style.display='none';}
  // Show/hide News subfilter bar
  const newsBar=document.getElementById('newsSubfilter');
  if(newsBar){if(tag==='news'){newsBar.classList.add('visible');}else{newsBar.classList.remove('visible');document.getElementById('newsCountrySelect').classList.remove('visible');}}
  // Show/hide Entertainment local panel
  handleEntertainmentTab(tag==='entertainment');
  if(tag==='__saved__'){renderSaved();updateMeta();return;}
  if(tag==='news'){loadNewsFeed(currentNewsScope);return;}
  loadFeed();
}

function startCountdown(){
  clearInterval(countdownInterval);countdownSecs=600;
  countdownInterval=setInterval(()=>{
    countdownSecs--;
    const m=String(Math.floor(countdownSecs/60)).padStart(2,'0'),s=String(countdownSecs%60).padStart(2,'0');
    const el=document.getElementById('countdownTxt');if(el)el.textContent=`${m}:${s}`;
    if(countdownSecs<=0)loadFeed();
  },1000);
}

let pullStart=0,pulling=false;
document.addEventListener('touchstart',e=>{if(window.scrollY===0)pullStart=e.touches[0].clientY;},{passive:true});
document.addEventListener('touchmove',e=>{
  if(pullStart&&window.scrollY===0){const dy=e.touches[0].clientY-pullStart;if(dy>40&&!pulling){pulling=true;document.getElementById('pullIndicator').classList.add('visible');}}
},{passive:true});
document.addEventListener('touchend',()=>{
  if(pulling){document.getElementById('pullIndicator').classList.remove('visible');pulling=false;pullStart=0;loadFeed();showToast('🔄 Refreshing…',1500);}else{pullStart=0;}
});

async function loadFeed(){
  if(currentTag==='__saved__'){renderSaved();return;}
  if(currentTag==='news'){loadNewsFeed(currentNewsScope);return;}
  const btn=document.getElementById('refreshBtn');
  btn.classList.add('spinning');showSkeletons();
  document.getElementById('countPill').textContent='Loading…';
  document.getElementById('sourceLabel').textContent='Fetching…';
  startCountdown();
  // Load signals in parallel with articles (non-blocking)
  loadSignals().catch(e=>console.warn('Signals:', e.message));
  try{
    const items=await loadArticles(currentTag);
    allArticles=items;
    applyFilters();
    renderSidebar(items);
    updateMeta(items);
  }catch(err){
    document.getElementById('articlesContainer').innerHTML=`<div class="error-box">
      <strong>⚠️ Could not load articles</strong>${err.message}
      <div class="err-btns">
        <button class="err-btn err-btn-primary" onclick="window.open('https://dev.to/t/${encodeURIComponent(currentTag)}','_blank')">Open DEV.to ↗</button>
        <button class="err-btn" style="background:#ff4500;color:#fff" onclick="window.open('https://reddit.com/r/${encodeURIComponent(REDDIT_MAP[currentTag]||currentTag)}','_blank')">Open Reddit ↗</button>
        <button class="err-btn err-btn-secondary" onclick="loadFeed()">↺ Retry</button>
      </div></div>`;
    document.getElementById('countPill').textContent='Error';
    updateMeta();
  }finally{btn.classList.remove('spinning');}
}

updateMeta();renderHistory();loadFeed();

// ── DARK MODE ──
function toggleDarkMode(){
  const isDark=document.documentElement.getAttribute('data-theme')==='dark';
  setDarkMode(!isDark);
}
function setDarkMode(dark){
  document.documentElement.setAttribute('data-theme',dark?'dark':'light');
  localStorage.setItem('readium_theme',dark?'dark':'light');
  const sunSVG=`<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>`;
  const moonSVG=`<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>`;
  const sun20=`<svg id="bnavDarkIcon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>`;
  const moon20=`<svg id="bnavDarkIcon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>`;
  document.getElementById('darkIcon').outerHTML=dark?sunSVG.replace('width="14"','id="darkIcon" width="14"'):moonSVG.replace('<svg','<svg id="darkIcon"');
  const bnavBtn=document.getElementById('bnavDark');
  if(bnavBtn)bnavBtn.querySelector('svg').outerHTML=dark?sun20:moon20;
}
// Apply saved theme on load
(function(){const t=localStorage.getItem('readium_theme');if(t==='dark')setDarkMode(true);})();

// ════════════════════════════════════════════
// ── NEWS TAB: Global · Country · Local ──
// ════════════════════════════════════════════
let currentNewsScope = 'global';
let currentEntPlatform = 'all';

const COUNTRY_NEWS_MAP = {
  us:{ rss:'https://feeds.bbci.co.uk/news/world/us_and_canada/rss.xml', name:'🇺🇸 USA', guardian:'us-news' },
  gb:{ rss:'https://feeds.bbci.co.uk/news/uk/rss.xml', name:'🇬🇧 UK', guardian:'uk-news' },
  in:{ rss:'https://feeds.bbci.co.uk/news/world/south_asia/rss.xml', name:'🇮🇳 India', guardian:'world/india' },
  au:{ rss:'https://feeds.bbci.co.uk/news/world/asia_pacific/rss.xml', name:'🇦🇺 Australia', guardian:'australia-news' },
  ca:{ rss:'https://feeds.bbci.co.uk/news/world/us_and_canada/rss.xml', name:'🇨🇦 Canada', guardian:'world/canada' },
  de:{ rss:'https://feeds.bbci.co.uk/news/world/europe/rss.xml', name:'🇩🇪 Germany', guardian:'world/germany' },
  fr:{ rss:'https://feeds.bbci.co.uk/news/world/europe/rss.xml', name:'🇫🇷 France', guardian:'world/france' },
  jp:{ rss:'https://feeds.bbci.co.uk/news/world/asia_pacific/rss.xml', name:'🇯🇵 Japan', guardian:'world/japan' },
  br:{ rss:'https://feeds.bbci.co.uk/news/world/latin_america/rss.xml', name:'🇧🇷 Brazil', guardian:'world/brazil' },
  za:{ rss:'https://feeds.bbci.co.uk/news/world/africa/rss.xml', name:'🇿🇦 South Africa', guardian:'world/africa' },
  sg:{ rss:'https://feeds.bbci.co.uk/news/world/asia_pacific/rss.xml', name:'🇸🇬 Singapore', guardian:'world/asia-pacific' },
  ae:{ rss:'https://feeds.bbci.co.uk/news/world/middle_east/rss.xml', name:'🇦🇪 UAE', guardian:'world/middleeast' },
  ng:{ rss:'https://feeds.bbci.co.uk/news/world/africa/rss.xml', name:'🇳🇬 Nigeria', guardian:'world/africa' },
  mx:{ rss:'https://feeds.bbci.co.uk/news/world/latin_america/rss.xml', name:'🇲🇽 Mexico', guardian:'world/mexico' },
  kr:{ rss:'https://feeds.bbci.co.uk/news/world/asia_pacific/rss.xml', name:'🇰🇷 South Korea', guardian:'world/south-korea' },
};

// ── RSS fetch with dual-proxy fallback ──
async function fetchRSSWithFallback(rawRssUrl, count = 20) {
  // Try rss2json first
  try {
    const url = `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(rawRssUrl)}&count=${count}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(12000) });
    if (res.ok) {
      const data = await res.json();
      if (data.status === 'ok' && data.items?.length) return data.items;
    }
  } catch(e) {}
  // Fallback: fetch raw XML via allorigins and parse manually
  try {
    const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(rawRssUrl)}`;
    const res = await fetch(proxyUrl, { signal: AbortSignal.timeout(14000) });
    if (!res.ok) throw new Error('allorigins failed');
    const wrapper = await res.json();
    const xml = wrapper.contents;
    const parser = new DOMParser();
    const doc = parser.parseFromString(xml, 'text/xml');
    const items = [...doc.querySelectorAll('item')].slice(0, count).map(el => {
      const g = t => el.querySelector(t)?.textContent?.trim() || '';
      const enclosure = el.querySelector('enclosure');
      const mediaThumbnail = el.querySelector('thumbnail') || el.querySelector('[url]');
      return {
        title: g('title'),
        link: g('link') || g('guid'),
        pubDate: g('pubDate'),
        description: g('description').replace(/<[^>]+>/g,'').slice(0,200),
        thumbnail: enclosure?.getAttribute('url') || mediaThumbnail?.getAttribute('url') || '',
        content: g('description')
      };
    }).filter(i => i.title);
    if (items.length) return items;
  } catch(e) {}
  throw new Error('RSS unavailable');
}

async function fetchBBCWorld() {
  const items = await fetchRSSWithFallback('https://feeds.bbci.co.uk/news/world/rss.xml', 20);
  return items.map(a => ({
    title: a.title, link: a.link, author: 'BBC News',
    pubDate: a.pubDate,
    description: (a.description||'').replace(/<[^>]+>/g,'').slice(0,200),
    thumb: a.thumbnail||'', categories: ['world','news'],
    readTime: Math.max(2, Math.ceil(((a.content||'').split(' ').length)/200)), source: 'bbc'
  }));
}

async function fetchAlJazeera() {
  const items = await fetchRSSWithFallback('https://www.aljazeera.com/xml/rss/all.xml', 20);
  return items.map(a => ({
    title: a.title, link: a.link, author: 'Al Jazeera',
    pubDate: a.pubDate,
    description: (a.description||'').replace(/<[^>]+>/g,'').slice(0,200),
    thumb: a.thumbnail||'', categories: ['world','news'], readTime: 3, source: 'aljazeera'
  }));
}

async function fetchNPRNews() {
  const items = await fetchRSSWithFallback('https://feeds.npr.org/1001/rss.xml', 15);
  return items.map(a => ({
    title: a.title, link: a.link, author: 'NPR',
    pubDate: a.pubDate,
    description: (a.description||'').replace(/<[^>]+>/g,'').slice(0,200),
    thumb: a.thumbnail||'', categories: ['news'], readTime: 3, source: 'npr'
  }));
}

async function fetchCountryBBC(country) {
  const info = COUNTRY_NEWS_MAP[country] || COUNTRY_NEWS_MAP['us'];
  const items = await fetchRSSWithFallback(info.rss, 20);
  return items.map(a => ({
    title: a.title, link: a.link, author: 'BBC News',
    pubDate: a.pubDate,
    description: (a.description||'').replace(/<[^>]+>/g,'').slice(0,200),
    thumb: a.thumbnail||'', categories: ['news',country], readTime: 3, source: 'bbc'
  }));
}

async function fetchLocalNewsGeo() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) { reject(new Error('Geolocation not supported')); return; }
    navigator.geolocation.getCurrentPosition(async pos => {
      try {
        const { latitude: lat, longitude: lon } = pos.coords;
        const geoProxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&zoom=6&accept-language=en`)}`;
        const geoRes = await fetch(geoProxyUrl, { signal: AbortSignal.timeout(10000) });
        const geoWrapper = await geoRes.json();
        const geoData = JSON.parse(geoWrapper.contents);
        const city = geoData.address?.city || geoData.address?.town || geoData.address?.state || 'Local';
        const countryCode = geoData.address?.country_code?.toLowerCase() || 'us';
        const localBtn = document.getElementById('nsfLocal');
        if (localBtn) localBtn.textContent = `📍 ${city}`;
        const info = COUNTRY_NEWS_MAP[countryCode] || COUNTRY_NEWS_MAP['us'];
        const [bbc, guardian] = await Promise.allSettled([fetchCountryBBC(countryCode), fetchGuardian(info.guardian)]);
        const results = [];
        if (bbc.status==='fulfilled') results.push(...bbc.value);
        if (guardian.status==='fulfilled') results.push(...guardian.value);
        if (!results.length) throw new Error('No local news found');
        resolve(results);
      } catch(e) { reject(e); }
    }, err => reject(new Error('Location access denied')));
  });
}

function selectNewsScope(btn, scope) {
  document.querySelectorAll('.nsf-pill').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  currentNewsScope = scope;
  const sel = document.getElementById('newsCountrySelect');
  if (scope === 'country') sel.classList.add('visible');
  else sel.classList.remove('visible');
  loadNewsFeed(scope);
}

function loadCountryNews() { loadNewsFeed('country'); }

async function loadNewsFeed(scope) {
  const btn = document.getElementById('refreshBtn');
  btn.classList.add('spinning'); showSkeletons();
  document.getElementById('countPill').textContent = 'Loading…';
  startCountdown();
  loadSignals().catch(() => {});
  try {
    let results = [], labels = [];
    if (scope === 'global') {
      currentLabel = '📰 World News';
      const [bbc, aj, guardian, hn, npr] = await Promise.allSettled([
        fetchBBCWorld(), fetchAlJazeera(), fetchGuardian('world'),
        fetchHN('world news breaking current events'), fetchNPRNews()
      ]);
      if (bbc.status==='fulfilled') { results.push(...bbc.value); labels.push('BBC'); }
      if (aj.status==='fulfilled') { results.push(...aj.value); labels.push('Al Jazeera'); }
      if (guardian.status==='fulfilled') { results.push(...guardian.value); labels.push('Guardian'); }
      if (hn.status==='fulfilled') results.push(...hn.value);
      if (npr.status==='fulfilled') { results.push(...npr.value); labels.push('NPR'); }
    } else if (scope === 'country') {
      const country = document.getElementById('newsCountrySelect').value;
      const info = COUNTRY_NEWS_MAP[country] || COUNTRY_NEWS_MAP['us'];
      currentLabel = `📰 ${info.name} News`;
      const [bbc, guardian] = await Promise.allSettled([fetchCountryBBC(country), fetchGuardian(info.guardian)]);
      if (bbc.status==='fulfilled') { results.push(...bbc.value); labels.push('BBC'); }
      if (guardian.status==='fulfilled') { results.push(...guardian.value); labels.push('Guardian'); }
    } else if (scope === 'local') {
      currentLabel = '📍 Local News';
      try {
        results = await fetchLocalNewsGeo();
        labels = ['BBC','Guardian'];
      } catch(e) {
        showToast('📍 ' + e.message + ' — showing global news');
        const [bbc, aj] = await Promise.allSettled([fetchBBCWorld(), fetchAlJazeera()]);
        if (bbc.status==='fulfilled') { results.push(...bbc.value); labels.push('BBC'); }
        if (aj.status==='fulfilled') { results.push(...aj.value); labels.push('Al Jazeera'); }
      }
    }
    document.getElementById('sourceLabel').textContent = labels.join(' · ') || 'News';
    const merged = mergeResults(results);
    if (!merged.length) throw new Error('No news articles found');
    allArticles = merged;
    applyFilters();
    renderSidebar(merged);
    updateMeta(merged);
  } catch(err) {
    document.getElementById('articlesContainer').innerHTML = `<div class="error-box"><strong>⚠️ Could not load news</strong> ${err.message}<div class="err-btns"><button class="err-btn err-btn-primary" onclick="loadNewsFeed(currentNewsScope)">↺ Retry</button></div></div>`;
    document.getElementById('countPill').textContent = 'Error';
    updateMeta();
  } finally { btn.classList.remove('spinning'); }
}

// ════════════════════════════════════════════
// ── ENTERTAINMENT PLATFORM TABS ──
// ════════════════════════════════════════════
function selectEntPlatform(btn, platform) {
  document.querySelectorAll('.ept-btn').forEach(b => {
    b.classList.remove('active','imdb-active','netflix-active','amazon-active','hotstar-active');
  });
  btn.classList.add('active');
  if (platform !== 'all') btn.classList.add(`${platform}-active`);
  currentEntPlatform = platform;
  loadEntShowcasePlatform(platform);
}

async function fetchIMDbTrendingMovies() {
  const rssUrl = encodeURIComponent('https://rss.imdb.com/chart/moviemeter');
  const url = `https://api.rss2json.com/v1/api.json?rss_url=${rssUrl}&count=14`;
  const res = await fetch(url, { signal: AbortSignal.timeout(12000) });
  if (!res.ok) throw new Error(`IMDb movies ${res.status}`);
  const data = await res.json();
  if (data.status !== 'ok' || !data.items?.length) throw new Error('IMDb movies: 0 items');
  return data.items.map(a => ({
    name: a.title.replace(/^\d+\.\s*/,'').trim(),
    link: a.link, img: a.thumbnail||'',
    rating: null, meta: '🎬 IMDb Trending', genre: 'Movie'
  }));
}

async function fetchIMDbTrendingTV() {
  const rssUrl = encodeURIComponent('https://rss.imdb.com/chart/tvmeter');
  const url = `https://api.rss2json.com/v1/api.json?rss_url=${rssUrl}&count=14`;
  const res = await fetch(url, { signal: AbortSignal.timeout(12000) });
  if (!res.ok) throw new Error(`IMDb TV ${res.status}`);
  const data = await res.json();
  if (data.status !== 'ok' || !data.items?.length) throw new Error('IMDb TV: 0 items');
  return data.items.map(a => ({
    name: a.title.replace(/^\d+\.\s*/,'').trim(),
    link: a.link, img: a.thumbnail||'',
    rating: null, meta: '📺 IMDb TV Trending', genre: 'TV Show'
  }));
}

async function fetchTVMazeWebchannel(id) {
  const res = await fetch(`https://api.tvmaze.com/webchannels/${id}/shows`, { signal: AbortSignal.timeout(12000) });
  if (!res.ok) throw new Error(`TVMaze wc/${id} ${res.status}`);
  const data = await res.json();
  if (!data?.length) throw new Error(`Webchannel ${id}: 0 shows`);
  return data.sort((a,b)=>(b.rating?.average||0)-(a.rating?.average||0)).slice(0,14).map(s => ({
    name: s.name,
    link: s.officialSite || s.url || `https://www.tvmaze.com/shows/${s.id}`,
    img: s.image?.medium||'', rating: s.rating?.average||null,
    meta: s.premiered ? s.premiered.slice(0,4) : '',
    genre: (s.genres||[]).slice(0,2).join(', ')||'Show'
  }));
}

async function fetchNetflixShows() { return fetchTVMazeWebchannel(1); }

async function fetchAmazonShows() {
  // Try all known Amazon Prime Video webchannel IDs (US, UK, global variants)
  for (const id of [8, 62, 83, 20, 2, 47, 35, 175, 68, 81, 14, 25]) {
    try { const r = await fetchTVMazeWebchannel(id); if (r.length) return r; } catch(e) {}
  }
  // Fallback: scan multiple pages and collect Amazon-labelled shows
  const collected = [];
  for (let page = 0; page < 8 && collected.length < 8; page++) {
    try {
      const res = await fetch(`https://api.tvmaze.com/shows?page=${page}`, { signal: AbortSignal.timeout(12000) });
      if (!res.ok) break;
      const data = await res.json();
      const hits = data.filter(s =>
        (s.webChannel?.name||'').toLowerCase().includes('amazon') ||
        (s.network?.name||'').toLowerCase().includes('amazon')
      );
      collected.push(...hits);
    } catch(e) { break; }
  }
  if (collected.length) {
    return collected.slice(0,14).map(s => ({
      name: s.name, link: s.officialSite||s.url||`https://www.tvmaze.com/shows/${s.id}`,
      img: s.image?.medium||'', rating: s.rating?.average||null,
      meta: s.premiered ? s.premiered.slice(0,4) : 'Amazon', genre: (s.genres||[]).slice(0,2).join(', ')||'Show'
    }));
  }
  // Last resort: return top-rated shows from TVMaze as curated fallback
  const res = await fetch('https://api.tvmaze.com/shows?page=1', { signal: AbortSignal.timeout(12000) });
  const data = await res.json();
  if (!data?.length) throw new Error('Amazon Prime: no shows found');
  return data.sort((a,b)=>(b.rating?.average||0)-(a.rating?.average||0)).slice(0,14).map(s => ({
    name: s.name, link: s.officialSite||s.url||`https://www.tvmaze.com/shows/${s.id}`,
    img: s.image?.medium||'', rating: s.rating?.average||null,
    meta: s.premiered ? s.premiered.slice(0,4) : 'Amazon', genre: (s.genres||[]).slice(0,2).join(', ')||'Show'
  }));
}

async function fetchHotstarShows() {
  for (const id of [107,42,110,117,119,84,167]) {
    try { const r = await fetchTVMazeWebchannel(id); if (r.length) return r; } catch(e) {}
  }
  for (let page = 0; page < 3; page++) {
    try {
      const res = await fetch(`https://api.tvmaze.com/shows?page=${page}`, { signal: AbortSignal.timeout(12000) });
      const data = await res.json();
      const disney = data.filter(s => {
        const wc = (s.webChannel?.name||'').toLowerCase();
        const nw = (s.network?.name||'').toLowerCase();
        return wc.includes('disney')||wc.includes('hotstar')||nw.includes('disney')||nw.includes('hotstar')||nw.includes('star');
      });
      if (disney.length >= 4) return disney.slice(0,14).map(s => ({
        name: s.name, link: s.officialSite||s.url||`https://www.tvmaze.com/shows/${s.id}`,
        img: s.image?.medium||'', rating: s.rating?.average||null,
        meta: s.premiered ? s.premiered.slice(0,4) : 'Hotstar', genre: (s.genres||[]).slice(0,2).join(', ')||'Show'
      }));
    } catch(e) {}
  }
  throw new Error('Disney+ Hotstar: shows not found via TVMaze');
}

async function loadEntShowcasePlatform(platform) {
  const con = document.getElementById('entContent');
  const labelEl = document.getElementById('entLocLabel');
  if (!con) return;
  con.innerHTML = `<div style="display:flex;align-items:center;gap:.5rem;padding:.85rem 1.1rem;font-size:.78rem;color:var(--text-muted)"><div class="live-dot" style="background:var(--accent)"></div>Loading…</div>`;
  if (platform === 'all') {
    if (labelEl) labelEl.textContent = 'TV · Movies · Games · No key required';
    await loadEntShowcase(); return;
  }
  let html = '';
  try {
    if (platform === 'imdb') {
      if (labelEl) labelEl.textContent = '⭐ IMDb Trending';
      const [movies, tv] = await Promise.allSettled([fetchIMDbTrendingMovies(), fetchIMDbTrendingTV()]);
      if (movies.status==='fulfilled' && movies.value.length)
        html += `<div class="ent-section-title">🎬 IMDb Trending Movies</div><div class="ent-cards-row">${movies.value.map(i=>renderShowcaseCard(i,'🎬')).join('')}</div>`;
      if (tv.status==='fulfilled' && tv.value.length)
        html += `<div class="ent-section-title">📺 IMDb Trending TV Shows</div><div class="ent-cards-row">${tv.value.map(i=>renderShowcaseCard(i,'📺')).join('')}</div>`;
      if (!html) throw new Error(movies.reason?.message || 'IMDb unavailable');
    } else if (platform === 'netflix') {
      if (labelEl) labelEl.textContent = '🔴 Netflix Popular';
      const shows = await fetchNetflixShows();
      html = `<div class="ent-section-title" style="color:#e50914">🔴 Netflix — Trending Shows</div><div class="ent-cards-row">${shows.map(i=>renderShowcaseCard(i,'📺')).join('')}</div>`;
    } else if (platform === 'amazon') {
      if (labelEl) labelEl.textContent = '📦 Amazon Prime Video';
      const shows = await fetchAmazonShows();
      html = `<div class="ent-section-title" style="color:#00a8e0">📦 Amazon Prime — Trending Shows</div><div class="ent-cards-row">${shows.map(i=>renderShowcaseCard(i,'📦')).join('')}</div>`;
    } else if (platform === 'hotstar') {
      if (labelEl) labelEl.textContent = '🌟 Disney+ Hotstar';
      const shows = await fetchHotstarShows();
      html = `<div class="ent-section-title" style="color:#1f80e0">🌟 Disney+ Hotstar — Trending Shows</div><div class="ent-cards-row">${shows.map(i=>renderShowcaseCard(i,'🌟')).join('')}</div>`;
    }
  } catch(e) {
    html = `<div class="ent-error">⚠️ ${e.message}<br><br>
      <button class="ent-permission-btn" style="font-size:.75rem;padding:.45rem .9rem" onclick="loadEntShowcasePlatform('${platform}')">↺ Retry</button>
      &nbsp;<button class="ent-permission-btn" style="font-size:.75rem;padding:.45rem .9rem;background:var(--surface3);color:var(--text-secondary)" onclick="document.getElementById('eptAll').click()">← All</button></div>`;
  }
  if (!html) html = `<div class="ent-error">⚠️ No content found.<br><button class="ent-permission-btn" style="font-size:.75rem;padding:.45rem .9rem;margin-top:.5rem" onclick="document.getElementById('eptAll').click()">← View All</button></div>`;
  con.innerHTML = html;
}

// ── MOBILE SEARCH ──
function openMobileSearch(){
  document.getElementById('mobileSearchBar').classList.add('active');
  document.getElementById('mobileSearchOverlay').classList.add('active');
  setTimeout(()=>document.getElementById('searchInputMobile').focus(),100);
}
function closeMobileSearch(){
  document.getElementById('mobileSearchBar').classList.remove('active');
  document.getElementById('mobileSearchOverlay').classList.remove('active');
}

// ── DRAWER ──
function openDrawer(){
  document.getElementById('drawer').classList.add('open');
  document.getElementById('drawerOverlay').classList.add('open');
  document.body.style.overflow='hidden';
}
function closeDrawer(){
  document.getElementById('drawer').classList.remove('open');
  document.getElementById('drawerOverlay').classList.remove('open');
  document.body.style.overflow='';
}

// ── BOTTOM NAV ──
function bnavSelect(tab){
  ['bnavHome','bnavSaved','bnavExplore'].forEach(id=>{const el=document.getElementById(id);if(el)el.classList.remove('active');});
  if(tab==='home'){
    document.getElementById('bnavHome').classList.add('active');
    // Navigate to home tab (programming default if on saved)
    if(currentTag==='__saved__'){
      const homeBtn=document.querySelector('.tab-btn:not(.saved-tab)');
      if(homeBtn)homeBtn.click();
    }
  } else if(tab==='saved'){
    document.getElementById('bnavSaved').classList.add('active');
    const savedBtn=document.querySelector('.saved-tab');
    if(savedBtn)savedBtn.click();
  }
}

// Show mobile search btn on mobile
(function(){
  function checkMobile(){
    const isMobile=window.innerWidth<640;
    const btn=document.getElementById('mobileSearchBtn');
    if(btn)btn.style.display=isMobile?'flex':'none';
    // Also hide 'Live' text on very small screens
    const lt=document.querySelector('.live-text');
    if(lt)lt.style.display=isMobile?'none':'inline';
  }
  checkMobile();
  window.addEventListener('resize',checkMobile);
})();
