// addon.js
const { addonBuilder, serveHTTP } = require('stremio-addon-sdk');
const axios = require('axios');

// Cấu hình
const API_BASE = 'https://www.xxvnapi.com/api';
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const manifest = {
    id: 'com.xxvnapi.cinema',
    version: '1.0.0',
    name: 'XXVN Cinema',
    description: 'Xem phim từ XXVN API - Có nguồn phát',
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
    idPrefixes: ['xxvn_']
};

const builder = new addonBuilder(manifest);

// Hàm lấy danh sách phim
async function fetchCatalog(page = 1) {
    try {
        const res = await axios.get(`${API_BASE}/phim-moi-cap-nhat?page=${page}`, {
            headers: { 'User-Agent': USER_AGENT, 'Accept': 'application/json' },
            timeout: 15000
        });
        return res.data;
    } catch (error) {
        console.error('❌ Lỗi danh sách:', error.message);
        return null;
    }
}

// Hàm lấy chi tiết phim
async function fetchDetail(slug) {
    try {
        const res = await axios.get(`${API_BASE}/phim/${slug}`, {
            headers: { 'User-Agent': USER_AGENT, 'Accept': 'application/json' },
            timeout: 15000
        });
        return res.data;
    } catch (error) {
        console.error('❌ Lỗi chi tiết:', error.message);
        return null;
    }
}

// Xử lý Catalog
builder.defineCatalogHandler(async (args) => {
    const page = args.extra?.skip ? Math.floor(args.extra.skip / 30) + 1 : 1;
    const data = await fetchCatalog(page);
    
    if (!data || !data.items) return { metas: [] };
    
    const metas = data.items.map(item => ({
        id: 'xxvn_' + item.slug,
        type: item.type || 'movie',
        name: item.name || 'Không tên',
        poster: item.poster_url || '',
        background: item.thumb_url || '',
        description: item.content || '',
        releaseInfo: item.year ? String(item.year) : '',
        runtime: item.time || '',
        genres: Array.isArray(item.category) ? item.category.map(c => c.name) : []
    }));
    
    // Phân trang
    if (data.pagination?.totalPages && page < data.pagination.totalPages) {
        metas.push({
            id: 'load-more',
            type: 'movie',
            name: 'Load More...',
            poster: '',
            nextCursor: page * 30
        });
    }
    
    return { metas };
});

// Xử lý Meta
builder.defineMetaHandler(async (args) => {
    const slug = args.id.replace('xxvn_', '');
    const data = await fetchDetail(slug);
    
    if (!data) return { meta: null };
    
    return {
        meta: {
            id: 'xxvn_' + slug,
            type: data.type || 'movie',
            name: data.name || 'Không tên',
            poster: data.poster_url || '',
            background: data.thumb_url || '',
            description: data.content || '',
            releaseInfo: data.year ? String(data.year) : '',
            runtime: data.time || '',
            genres: Array.isArray(data.category) ? data.category.map(c => c.name) : []
        }
    };
});

// Xử lý Stream - QUAN TRỌNG: Lấy nguồn phát từ episodes
builder.defineStreamHandler(async (args) => {
    const slug = args.id.replace('xxvn_', '');
    const data = await fetchDetail(slug);
    
    if (!data || !data.episodes) return { streams: [] };
    
    const streams = [];
    
    // Duyệt qua tất cả các tập phim
    data.episodes.forEach(ep => {
        // Duyệt qua tất cả các server trong tập
        (ep.server_data || []).forEach(server => {
            if (server.link_embed) {
                streams.push({
                    name: `Embed - ${server.server_name || 'Server'}`,
                    description: `Tập: ${ep.name || ''}`,
                    url: server.link_embed,
                    behaviorHints: {
                        notWebReady: true,
                        proxyHeaders: {
                            request: {
                                'User-Agent': USER_AGENT,
                                'Referer': 'https://www.xxvnapi.com/'
                            }
                        }
                    }
                });
            }
            if (server.link_m3u8) {
                streams.push({
                    name: `HLS - ${server.server_name || 'Server'}`,
                    description: `Tập: ${ep.name || ''}`,
                    url: server.link_m3u8,
                    behaviorHints: {
                        notWebReady: true,
                        proxyHeaders: {
                            request: {
                                'User-Agent': USER_AGENT,
                                'Referer': 'https://www.xxvnapi.com/'
                            }
                        }
                    }
                });
            }
            if (server.link_mp4) {
                streams.push({
                    name: `MP4 - ${server.server_name || 'Server'}`,
                    description: `Tập: ${ep.name || ''}`,
                    url: server.link_mp4,
                    behaviorHints: {
                        notWebReady: true
                    }
                });
            }
        });
    });
    
    return { streams };
});

// Khởi động server
const port = process.env.PORT || 7000;
serveHTTP(builder.getInterface(), { port });

console.log('✅ XXVN Cinema đang chạy!');
console.log('🔗 URL: https://topxx-vjws.onrender.com/manifest.json');
