// addon.js
const { addonBuilder, serveHTTP } = require('stremio-addon-sdk');
const axios = require('axios');

// Cấu hình
const API_BASE = 'https://topxx.vip/api/v1';
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const REFERER = 'https://topxx.vip/';

// Proxy để vượt CORS (thử nhiều proxy)
const PROXY_1 = 'https://corsproxy.io/?url=';
const PROXY_2 = 'https://api.allorigins.win/raw?url=';

const manifest = {
    id: 'org.topxx.cinema',
    version: '5.0.0', // Tăng version
    name: 'TopXX Cinema',
    description: 'Xem phim mới nhất - Bản proxy kép',
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

// Xử lý Stream - DÙNG PROXY KÉP
builder.defineStreamHandler(async (args) => {
    const movieCode = args.id.replace('topxx_', '');
    
    const data = await getMovies();
    const movie = data?.data?.find(m => m.code === movieCode);
    
    if (!movie || !movie.sources) {
        return { streams: [] };
    }
    
    // Tạo streams với proxy kép (thử cả 2 proxy)
    const streams = movie.sources.map((source, index) => {
        // Sử dụng proxy 1
        const proxiedUrl1 = PROXY_1 + encodeURIComponent(source.link);
        // Sử dụng proxy 2
        const proxiedUrl2 = PROXY_2 + encodeURIComponent(source.link);
        
        return {
            name: `TopXX Server ${index + 1}`,
            description: `${movie.quality || 'HD'} - ${source.type}`,
            // Thử proxy 1 trước, nếu không được dùng proxy 2
            url: proxiedUrl1,
            behaviorHints: {
                notWebReady: true,
                proxyHeaders: {
                    request: {
                        'User-Agent': USER_AGENT,
                        'Referer': REFERER
                    }
                }
            }
        };
    });
    
    // Thêm stream dự phòng với proxy 2
    streams.push({
        name: 'TopXX Proxy 2',
        description: `${movie.quality || 'HD'} - Dự phòng`,
        url: PROXY_2 + encodeURIComponent(movie.sources[0]?.link || ''),
        behaviorHints: {
            notWebReady: true
        }
    });
    
    console.log(`✅ Tìm thấy ${streams.length} nguồn (đã proxy kép)`);
    return { streams };
});

// Khởi động server
const port = process.env.PORT || 7000;
serveHTTP(builder.getInterface(), { port });

console.log('✅ TopXX Cinema (Bản Proxy Kép) v5.0.0 đang chạy!');
console.log('🔗 URL: https://topxx-vjws.onrender.com/manifest.json');
