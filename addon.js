// addon.js
const { addonBuilder, serveHTTP } = require('stremio-addon-sdk');
const axios = require('axios');

// Cấu hình
const API_BASE = 'https://ophim1.com';
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const manifest = {
    id: 'com.ophim.cinema',
    version: '1.0.0',
    name: 'OPhim Cinema',
    description: 'Xem phim từ OPhim API - Có nguồn phát trực tiếp',
    resources: ['catalog', 'stream', 'meta'],
    types: ['movie', 'series'],
    catalogs: [
        {
            type: 'movie',
            id: 'phim-moi-cap-nhat',
            name: 'Phim Mới Cập Nhật',
            extra: [{ name: 'skip', isRequired: false }]
        }
    ],
    idPrefixes: ['ophim_']
};

const builder = new addonBuilder(manifest);

async function fetchCatalog(page = 1) {
    try {
        const res = await axios.get(`${API_BASE}/danh-sach/phim-moi-cap-nhat?page=${page}`, {
            headers: { 'User-Agent': USER_AGENT },
            timeout: 15000
        });
        return res.data;
    } catch (error) {
        console.error('❌ Lỗi danh sách:', error.message);
        return null;
    }
}

async function fetchDetail(slug) {
    try {
        const res = await axios.get(`${API_BASE}/phim/${slug}`, {
            headers: { 'User-Agent': USER_AGENT },
            timeout: 15000
        });
        return res.data;
    } catch (error) {
        console.error('❌ Lỗi chi tiết:', error.message);
        return null;
    }
}

builder.defineCatalogHandler(async (args) => {
    const page = args.extra?.skip ? Math.floor(args.extra.skip / 30) + 1 : 1;
    const data = await fetchCatalog(page);
    
    if (!data || !data.items) return { metas: [] };
    
    return {
        metas: data.items.map(item => ({
            id: 'ophim_' + item.slug,
            type: item.type || 'movie',
            name: item.name || 'Không tên',
            poster: item.poster_url || '',
            background: item.thumb_url || '',
            description: item.content || '',
            releaseInfo: item.year ? String(item.year) : '',
            genres: Array.isArray(item.category) ? item.category.map(c => c.name) : []
        }))
    };
});

builder.defineMetaHandler(async (args) => {
    const slug = args.id.replace('ophim_', '');
    const data = await fetchDetail(slug);
    
    if (!data) return { meta: null };
    
    return {
        meta: {
            id: 'ophim_' + slug,
            type: data.movie?.type || 'movie',
            name: data.movie?.name || 'Không tên',
            poster: data.movie?.poster_url || '',
            background: data.movie?.thumb_url || '',
            description: data.movie?.content || '',
            releaseInfo: data.movie?.year ? String(data.movie.year) : '',
            genres: Array.isArray(data.movie?.category) ? data.movie.category.map(c => c.name) : []
        }
    };
});

builder.defineStreamHandler(async (args) => {
    const slug = args.id.replace('ophim_', '');
    const data = await fetchDetail(slug);
    
    if (!data || !data.episodes) return { streams: [] };
    
    const streams = [];
    
    // Lấy server đầu tiên
    const servers = data.episodes[0].server_data || [];
    
    for (const server of servers) {
        if (server.link_m3u8) {
            streams.push({
                name: `OPhim - HLS`,
                description: `Tập: ${data.episodes[0].name}`,
                url: server.link_m3u8,
                behaviorHints: {
                    notWebReady: true,
                    proxyHeaders: {
                        request: {
                            'User-Agent': USER_AGENT,
                            'Referer': 'https://ophim1.com/'
                        }
                    }
                }
            });
        }
        if (server.link_embed) {
            streams.push({
                name: `OPhim - Server`,
                description: `Tập: ${data.episodes[0].name}`,
                url: server.link_embed,
                behaviorHints: {
                    notWebReady: true,
                    proxyHeaders: {
                        request: {
                            'User-Agent': USER_AGENT,
                            'Referer': 'https://ophim1.com/'
                        }
                    }
                }
            });
        }
    }
    
    return { streams };
});

serveHTTP(builder.getInterface(), { port: process.env.PORT || 7000 });
console.log('✅ OPhim Cinema v1.0.0 đang chạy!');
