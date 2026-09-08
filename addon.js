// addon.js
const { addonBuilder, serveHTTP } = require('stremio-addon-sdk');
const axios = require('axios');

// Cấu hình API
const API_BASE = 'https://topxx.vip/api/v1';
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const manifest = {
    id: 'org.topxx.cinema',
    version: '1.5.0', // Tăng version
    name: 'TopXX Cinema',
    description: 'Xem phim mới nhất - Bản đầy đủ',
    resources: ['catalog', 'stream', 'meta'], // Thêm 'meta'
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

// Hàm lấy dữ liệu
async function getMovies() {
    try {
        const response = await axios.get(`${API_BASE}/movies/latest?page=1`, {
            headers: {
                'User-Agent': USER_AGENT,
                'Accept': 'application/json',
                'Referer': 'https://topxx.vip/'
            },
            timeout: 10000
        });
        return response.data;
    } catch (error) {
        console.error('❌ Lỗi API:', error.message);
        return null;
    }
}

// Xử lý Catalog (Danh sách phim)
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

// Xử lý Meta (Thông tin chi tiết phim - PHẦN QUAN TRỌNG NHẤT)
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

// Xử lý Stream (Nguồn phát)
builder.defineStreamHandler(async (args) => {
    const code = args.id.replace('topxx_', '');
    
    const data = await getMovies();
    const movie = data?.data?.find(m => m.code === code);
    
    if (!movie || !movie.sources) {
        return { streams: [] };
    }
    
    const streams = movie.sources.map((source, index) => ({
        name: `TopXX Server ${index + 1}`,
        description: `${movie.quality || 'HD'} - ${source.type}`,
        url: source.link,
        behaviorHints: {
            notWebReady: true,
            proxyHeaders: {
                request: {
                    'User-Agent': USER_AGENT,
                    'Referer': 'https://topxx.vip/'
                }
            }
        }
    }));
    
    return { streams };
});

// Khởi động server
const port = process.env.PORT || 7000;
serveHTTP(builder.getInterface(), { port });

console.log('✅ TopXX Cinema (Bản đầy đủ) đang chạy!');
console.log('🔗 URL: https://topxx-vjws.onrender.com/manifest.json');
