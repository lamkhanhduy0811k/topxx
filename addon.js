// addon.js
const { addonBuilder, serveHTTP } = require('stremio-addon-sdk');
const axios = require('axios');
const cheerio = require('cheerio');

// Cấu hình
const API_BASE = 'https://topxx.vip/api/v1';
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const REFERER = 'https://topxx.vip/';

const manifest = {
    id: 'org.topxx.cinema',
    version: '12.0.0', // Tăng version để Stremio nhận diện
    name: 'TopXX Cinema',
    description: 'Xem phim mới nhất - Bản HLS trực tiếp',
    resources: ['catalog', 'stream', 'meta'],
    types: ['movie'],
    catalogs: [
        {
            type: 'movie',
            id: 'topxx-latest',
            name: 'Phim Mới Nhất'
        }
    ],
    idPrefixes: ['topxx_']
};

const builder = new addonBuilder(manifest);

// Hàm lấy danh sách phim
async function getMovies() {
    try {
        const response = await axios.get(`${API_BASE}/movies/latest?page=1`, {
            headers: {
                'User-Agent': USER_AGENT,
                'Accept': 'application/json',
                'Referer': REFERER
            },
            timeout: 15000
        });
        return response.data;
    } catch (error) {
        console.error('❌ Lỗi API:', error.message);
        return null;
    }
}

// Hàm bóc tách link HLS từ iframe embed
async function extractHlsUrl(embedUrl) {
    try {
        // Tải trang embed
        const response = await axios.get(embedUrl, {
            headers: {
                'User-Agent': USER_AGENT,
                'Referer': REFERER
            },
            timeout: 10000
        });
        
        const html = response.data;
        
        // Tìm link m3u8 trong HTML
        const m3u8Match = html.match(/https?:\/\/[^"'\s]+\.m3u8[^"'\s]*/);
        if (m3u8Match) {
            console.log('✅ Tìm thấy link HLS:', m3u8Match[0]);
            return m3u8Match[0];
        }
        
        // Tìm trong script (window.EMBED_CONFIG)
        const configMatch = html.match(/hls_url[:\s]*["']([^"']+)["']/);
        if (configMatch) {
            console.log('✅ Tìm thấy HLS trong config:', configMatch[1]);
            return configMatch[1].replace(/\\\//g, '/');
        }
        
        // Tìm link mp4
        const mp4Match = html.match(/https?:\/\/[^"'\s]+\.mp4[^"'\s]*/);
        if (mp4Match) {
            return mp4Match[0];
        }
        
        return null;
    } catch (error) {
        console.error('❌ Lỗi bóc tách:', error.message);
        return null;
    }
}

// Xử lý Catalog
builder.defineCatalogHandler(async () => {
    const data = await getMovies();
    
    if (!data || !data.data) {
        return { metas: [] };
    }
    
    const metas = data.data.map(movie => {
        const viTrans = movie.trans?.find(t => t.locale === 'vi') || movie.trans?.[0];
        return {
            id: 'topxx_' + movie.code,
            type: 'movie',
            name: viTrans?.title || movie.code,
            poster: movie.thumbnail,
            background: movie.thumbnail,
            description: viTrans?.description || '',
            releaseInfo: movie.publish_at ? new Date(movie.publish_at).getFullYear().toString() : '',
            runtime: movie.duration,
            genres: movie.genres?.map(g => g.trans?.[0]?.name || g.code) || []
        };
    });
    
    console.log(`✅ Đã lấy ${metas.length} phim`);
    return { metas };
});

// Xử lý Meta
builder.defineMetaHandler(async (args) => {
    const movieCode = args.id.replace('topxx_', '');
    
    const data = await getMovies();
    const movie = data?.data?.find(m => m.code === movieCode);
    
    if (!movie) {
        return { meta: null };
    }
    
    const viTrans = movie.trans?.find(t => t.locale === 'vi') || movie.trans?.[0];
    
    return {
        meta: {
            id: 'topxx_' + movie.code,
            type: 'movie',
            name: viTrans?.title || movie.code,
            poster: movie.thumbnail,
            background: movie.thumbnail,
            description: viTrans?.description || '',
            releaseInfo: movie.publish_at ? new Date(movie.publish_at).getFullYear().toString() : '',
            runtime: movie.duration,
            genres: movie.genres?.map(g => g.trans?.[0]?.name || g.code) || []
        }
    };
});

// Xử lý Stream - TÌM LINK HLS TRỰC TIẾP
builder.defineStreamHandler(async (args) => {
    const movieCode = args.id.replace('topxx_', '');
    
    const data = await getMovies();
    const movie = data?.data?.find(m => m.code === movieCode);
    
    if (!movie || !movie.sources) {
        return { streams: [] };
    }
    
    const streams = [];
    
    // Duyệt qua từng source
    for (const source of movie.sources) {
        // Nếu là embed, bóc tách để tìm HLS
        if (source.type === 'embed' || source.link.includes('embed')) {
            const hlsUrl = await extractHlsUrl(source.link);
            if (hlsUrl) {
                streams.push({
                    name: `TopXX HLS Server ${streams.length + 1}`,
                    description: `${movie.quality || 'HD'} - HLS trực tiếp`,
                    url: hlsUrl,
                    behaviorHints: {
                        notWebReady: true,
                        proxyHeaders: {
                            request: {
                                'User-Agent': USER_AGENT,
                                'Referer': source.link
                            }
                        }
                    }
                });
            }
        } else {
            // Nguồn trực tiếp (mp4, m3u8)
            streams.push({
                name: `TopXX Direct Server ${streams.length + 1}`,
                description: `${movie.quality || 'HD'}`,
                url: source.link,
                behaviorHints: {
                    notWebReady: true
                }
            });
        }
    }
    
    console.log(`✅ Tìm thấy ${streams.length} nguồn HLS trực tiếp`);
    return { streams };
});

// Khởi động server
const port = process.env.PORT || 7000;
serveHTTP(builder.getInterface(), { port });

console.log('✅ TopXX Cinema (Bản HLS) v12.0.0 đang chạy!');
console.log('🔗 URL: https://topxx-vjws.onrender.com/manifest.json');
