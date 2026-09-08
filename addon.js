// addon.js
const { addonBuilder, serveHTTP } = require('stremio-addon-sdk');
const axios = require('axios');

// Cấu hình API
const API_BASE = 'https://www.xxvnapi.com/api';
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';

// Manifest
const manifest = {
    id: 'com.xxvnapi.cinema',
    version: '1.0.0',
    name: 'XXVN Cinema',
    description: 'Xem phim từ XXVN API',
    resources: ['catalog', 'stream', 'meta'],
    types: ['movie', 'series'],
    catalogs: [
        {
            type: 'movie',
            id: 'phim-moi-cap-nhat',
            name: 'Phim Mới Cập Nhật',
            extra: [ { name: 'skip', isRequired: false } ]
        }
    ],
    idPrefixes: ['xxvn_']
};

const builder = new addonBuilder(manifest);

// Hàm lấy danh sách phim
async function fetchCatalog(page = 1) {
    const url = `${API_BASE}/phim-moi-cap-nhat?page=${page}`;
    try {
        const res = await axios.get(url, { headers: { 'User-Agent': USER_AGENT, 'Accept': 'application/json' }, timeout: 15000 });
        return res.data;
    } catch (error) {
        console.error('Lỗi lấy danh sách:', error.message);
        return null;
    }
}

// Hàm lấy chi tiết phim (dùng endpoint /phim/{slug})
async function fetchDetail(slug) {
    const url = `${API_BASE}/phim/${slug}`;
    try {
        const res = await axios.get(url, { headers: { 'User-Agent': USER_AGENT, 'Accept': 'application/json' }, timeout: 15000 });
        return res.data;
    } catch (error) {
        console.error('Lỗi lấy chi tiết:', error.message);
        return null;
    }
}

// Xử lý Catalog
builder.defineCatalogHandler(async (args) => {
    const page = args.extra?.skip ? Math.floor(args.extra.skip / 30) + 1 : 1;
    const data = await fetchCatalog(page);

    if (!data || !data.items || data.items.length === 0) {
        return { metas: [] };
    }

    const metas = data.items.map(item => ({
        id: 'xxvn_' + (item.slug || item._id),
        type: 'movie',
        name: item.name || item.origin_name || 'Không tên',
        poster: item.poster_url || '',
        background: item.thumb_url || '',
        description: item.content || '',
        releaseInfo: item.year ? String(item.year) : '',
        runtime: item.time || '',
        genres: Array.isArray(item.category) ? item.category.map(c => c.name) : []
    }));

    // Hỗ trợ phân trang
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

// Xử lý Meta (Chi tiết phim)
builder.defineMetaHandler(async (args) => {
    const slug = args.id.replace('xxvn_', '');
    const data = await fetchDetail(slug);

    if (!data) return { meta: null };

    return {
        meta: {
            id: 'xxvn_' + slug,
            type: 'movie',
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

// Xử lý Stream (Lấy link phát từ chi tiết)
builder.defineStreamHandler(async (args) => {
    const slug = args.id.replace('xxvn_', '');
    const data = await fetchDetail(slug);

    if (!data || !data.episodes || data.episodes.length === 0) {
        return { streams: [] };
    }

    const streams = [];
    // Duyệt qua các tập phim
    data.episodes.forEach(ep => {
        // Duyệt qua các server trong tập
        (ep.server_data || []).forEach(server => {
            if (server.link_embed) {
                streams.push({
                    name: `Server: ${server.server_name || 'Embed'}`,
                    description: `Tập: ${ep.name || ''}`,
                    url: server.link_embed,
                    behaviorHints: { notWebReady: true }
                });
            }
            if (server.link_m3u8) {
                streams.push({
                    name: `Server: ${server.server_name || 'HLS'}`,
                    description: `Tập: ${ep.name || ''}`,
                    url: server.link_m3u8,
                    behaviorHints: { notWebReady: true }
                });
            }
        });
    });

    return { streams };
});

// Khởi động server
const port = process.env.PORT || 7000;
serveHTTP(builder.getInterface(), { port });

console.log('XXVN Cinema Addon đang chạy tại port ' + port);
