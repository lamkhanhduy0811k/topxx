// addon.js
const { addonBuilder, serveHTTP } = require('stremio-addon-sdk');
const axios = require('axios');

// Cấu hình
const API_BASE = 'https://topxx.vip/api/v1';
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const REFERER = 'https://topxx.vip/';

const manifest = {
    id: 'org.topxx.cinema',
    version: '3.0.0', // Tăng version để Stremio nhận diện
    name: 'TopXX Cinema',
    description: 'Xem phim mới nhất - Bản embed',
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
            timeout: 15000 // 15 giây
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

// Xử lý Stream - CHUYÊN CHO EMBED
builder.defineStreamHandler(async (args) => {
    const movieCode = args.id.replace('topxx_', '');
    
    // Lấy dữ liệu từ API
    const data = await getMovies();
    const movie = data?.data?.find(m => m.code === movieCode);
    
    if (!movie || !movie.sources) {
        return { streams: [] };
    }
    
    // Tạo streams từ sources
    const streams = movie.sources.map((source, index) => {
        // Nếu là embed, thêm proxyHeaders để vượt CORS
        if (source.type === 'embed') {
            return {
                name: `TopXX Server ${index + 1}`,
                description: `${movie.quality || 'HD'} - Embed`,
                url: source.link,
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
        }
        
        // Nếu không phải embed
        return {
            name: `TopXX Server ${index + 1}`,
            description: `${movie.quality || 'HD'}`,
            url: source.link,
            behaviorHints: {
                notWebReady: true
            }
        };
    });
    
    console.log(`✅ Tìm thấy ${streams.length} nguồn cho ${movieCode}`);
    return { streams };
});

// Khởi động server
const port = process.env.PORT || 7000;
serveHTTP(builder.getInterface(), { port });

console.log('✅ TopXX Cinema (Bản Embed) v3.0.0 đang chạy!');
console.log('🔗 URL: https://topxx-vjws.onrender.com/manifest.json');
