// addon.js
const { addonBuilder, serveHTTP } = require('stremio-addon-sdk');
const axios = require('axios');

// Cấu hình
const API_BASE = 'https://phim.nguonc.com/api';
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const manifest = {
    id: 'com.nguonc.cinema',
    version: '2.0.0',
    name: 'NGUONC Cinema',
    description: 'Xem phim từ NGUONC API - Bản có nguồn phát',
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

async function fetchDetail(slug) {
    try {
        const res = await axios.get(`${API_BASE}/film/${slug}`, {
            headers: { 'User-Agent': USER_AGENT },
            timeout: 15000
        });
        return res.data;
    } catch (error) {
        console.error('❌ Lỗi chi tiết:', error.message);
        return null;
    }
}

// Hàm bóc tách link từ iframe embed
async function extractStreamFromEmbed(embedUrl) {
    try {
        const response = await axios.get(embedUrl, {
            headers: { 'User-Agent': USER_AGENT },
            timeout: 10000
        });
        const html = response.data;
        
        // Tìm link m3u8 trực tiếp
        const m3u8Match = html.match(/https?:\/\/[^"'\s]+\.m3u8[^"'\s]*/);
        if (m3u8Match) {
            return m3u8Match[0];
        }
        
        // Tìm trong script JSON
        const configMatch = html.match(/hls_url[:\s]*["']([^"']+)["']/);
        if (configMatch) {
            return configMatch[1].replace(/\\\//g, '/');
        }
        
        // Tìm link mp4
        const mp4Match = html.match(/https?:\/\/[^"'\s]+\.mp4[^"'\s]*/);
        if (mp4Match) {
            return mp4Match[0];
        }
        
        return null;
    } catch (error) {
        return null;
    }
}

builder.defineCatalogHandler(async (args) => {
    const page = args.extra?.skip ? Math.floor(args.extra.skip / 30) + 1 : 1;
    const data = await fetchCatalog(page);
    
    if (!data || !data.items) return { metas: [] };
    
    return {
        metas: data.items.map(item => ({
            id: 'nguonc_' + item.slug,
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
            genres: Array.isArray(data.movie?.category) ? data.movie.category.map(c => c.name) : []
        }
    };
});

builder.defineStreamHandler(async (args) => {
    const slug = args.id.replace('nguonc_', '');
    const data = await fetchDetail(slug);
    
    if (!data || !data.episodes) return { streams: [] };
    
    const streams = [];
    
    // Lấy server đầu tiên (Vietsub)
    const servers = data.episodes[0].items || [];
    
    for (const ep of servers.slice(0, 1)) { // Chỉ lấy tập 1
        if (ep.embed) {
            const hlsUrl = await extractStreamFromEmbed(ep.embed);
            if (hlsUrl) {
                streams.push({
                    name: `NGUONC - Vietsub`,
                    description: `Tập ${ep.name}`,
                    url: hlsUrl,
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
            } else {
                // Nếu không tìm thấy HLS, gửi link embed
                streams.push({
                    name: `NGUONC - Vietsub (Embed)`,
                    description: `Tập ${ep.name}`,
                    url: ep.embed,
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
        }
    }
    
    return { streams };
});

serveHTTP(builder.getInterface(), { port: process.env.PORT || 7000 });
console.log('✅ NGUONC Cinema v2.0.0 đang chạy!');
