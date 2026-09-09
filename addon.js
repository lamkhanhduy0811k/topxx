// addon.js
const { addonBuilder, serveHTTP } = require('stremio-addon-sdk');
const axios = require('axios');

// Cấu hình
const API_BASE = 'https://phim.nguonc.com/api';
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const manifest = {
    id: 'com.nguonc.cinema',
    version: '1.0.0',
    name: 'NGUONC Cinema',
    description: 'Xem phim từ NGUONC API - Miễn phí, chất lượng cao',
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
    idPrefixes: ['nguonc_']
};

const builder = new addonBuilder(manifest);

// Hàm lấy danh sách phim
async function fetchCatalog(page = 1) {
    try {
        const res = await axios.get(`${API_BASE}/films/phim-moi-cap-nhat?page=${page}`, {
            headers: { 'User-Agent': USER_AGENT },
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
        const res = await axios.get(`${API_BASE}/films/${slug}`, {
            headers: { 'User-Agent': USER_AGENT },
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
        id: 'nguonc_' + item.slug,
        type: item.type || 'movie',
        name: item.name || 'Không tên',
        poster: item.poster_url || '',
        background: item.thumb_url || '',
        description: item.content || '',
        releaseInfo: item.year ? String(item.year) : '',
        genres: Array.isArray(item.category) ? item.category.map(c => c.name) : []
    }));
    
    // Phân trang
    if (data.paginate?.total_pages && page < data.paginate.total_pages) {
        metas.push({
            id: 'load-more',
            type: 'movie',
            name: '📥 Load More...',
            poster: '',
            nextCursor: page * 30
        });
    }
    
    return { metas };
});

// Xử lý Meta
builder.defineMetaHandler(async (args) => {
    const slug = args.id.replace('nguonc_', '');
    const data = await fetchDetail(slug);
    
    if (!data) return { meta: null };
    
    return {
        meta: {
            id: 'nguonc_' + slug,
            type: data.movie?.type || 'movie',
            name: data.movie?.name || 'Không tên',
            poster: data.movie?.poster_url || '',
            background: data.movie?.thumb_url || '',
            description: data.movie?.content || '',
            releaseInfo: data.movie?.year ? String(data.movie.year) : '',
            runtime: data.movie?.time || '',
            genres: Array.isArray(data.movie?.category) ? data.movie.category.map(c => c.name) : []
        }
    };
});

// Xử lý Stream - Lấy nguồn phát
builder.defineStreamHandler(async (args) => {
    const slug = args.id.replace('nguonc_', '');
    const data = await fetchDetail(slug);
    
    if (!data || !data.episodes) return { streams: [] };
    
    const streams = [];
    
    // Lấy tập mới nhất
    const latestEp = data.episodes[0]?.server_data || [];
    
    latestEp.forEach(server => {
        if (server.link_m3u8) {
            streams.push({
                name: `HLS - ${server.server_name || 'Server'}`,
                description: `Tập: ${data.episodes[0].name || 'Mới nhất'}`,
                url: server.link_m3u8,
                behaviorHints: {
                    notWebReady: true,
                    proxyHeaders: {
                        request: {
                            'User-Agent': USER_AGENT,
                            'Referer': 'https://phim.nguonc.com/'
                        }
                    }
                }
            });
        }
        if (server.link_embed) {
            streams.push({
                name: `Embed - ${server.server_name || 'Server'}`,
                description: `Tập: ${data.episodes[0].name || 'Mới nhất'}`,
                url: server.link_embed,
                behaviorHints: {
                    notWebReady: true,
                    proxyHeaders: {
                        request: {
                            'User-Agent': USER_AGENT,
                            'Referer': 'https://phim.nguonc.com/'
                        }
                    }
                }
            });
        }
    });
    
    return { streams };
});

// Khởi động server
const port = process.env.PORT || 7000;
serveHTTP(builder.getInterface(), { port });

console.log('✅ NGUONC Cinema đang chạy!');
console.log('🔗 URL: https://topxx-vjws.onrender.com/manifest.json');
