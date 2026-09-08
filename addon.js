// addon.js
const { addonBuilder, serveHTTP } = require('stremio-addon-sdk');
const axios = require('axios');

// Cấu hình
const API_BASE = 'https://topxx.vip/api/v1';
const MANIFEST_DATA = {
    id: 'org.topxx.addon',
    version: '1.0.0',
    name: 'TopXX Movies',
    description: 'Xem phim mới nhất từ TopXX',
    logo: 'https://i.imgur.com/your-logo.png',
    resources: ['catalog', 'stream', 'meta'],
    types: ['movie', 'series'],
    catalogs: [
        {
            type: 'movie',
            id: 'topxx-latest',
            name: 'Phim Mới',
            extra: [{ name: 'search', isRequired: false }]
        }
    ],
    idPrefixes: ['topxx_'] // Giúp phân biệt ID với addon khác
};

const builder = new addonBuilder(MANIFEST_DATA);

// Hàm lấy dữ liệu từ API
async function fetchMovies(page = 1, searchTerm = '') {
    try {
        let url = `${API_BASE}/movies/latest?page=${page}`;
        if (searchTerm) {
            url = `${API_BASE}/movies/search?q=${encodeURIComponent(searchTerm)}`;
        }
        
        const response = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });
        return response.data;
    } catch (error) {
        console.error('Lỗi khi lấy dữ liệu:', error.message);
        return null;
    }
}

// Chuyển đổi dữ liệu API sang định dạng Stremio
function transformToCatalog(movies) {
    return movies.map(movie => {
        const viTrans = movie.trans?.find(t => t.locale === 'vi') || movie.trans?.[0];
        return {
            id: 'topxx_' + movie.code,
            type: 'movie',
            name: viTrans?.title || 'Unknown',
            poster: movie.thumbnail,
            background: movie.thumbnail,
            description: viTrans?.description || '',
            releaseInfo: movie.publish_at ? new Date(movie.publish_at).getFullYear().toString() : '',
            runtime: movie.duration,
            genres: movie.genres?.map(g => {
                const viGenre = g.trans?.find(t => t.locale === 'vi');
                return viGenre?.name || g.code;
            }) || []
        };
    });
}

// Xử lý Catalog
builder.defineCatalogHandler(async (args) => {
    const page = args.extra?.skip ? Math.floor(args.extra.skip / 30) + 1 : 1;
    const searchTerm = args.extra?.search || '';
    
    const data = await fetchMovies(page, searchTerm);
    
    if (!data || !data.data) {
        return { metas: [] };
    }
    
    const metas = transformToCatalog(data.data);
    
    // Thêm phân trang
    if (data.links?.next) {
        metas.push({
            id: 'load-more',
            type: 'movie',
            name: 'Load More...',
            poster: '',
            nextCursor: (page + 1) * 30
        });
    }
    
    return { metas };
});

// Xử lý Meta (Thông tin chi tiết phim)
builder.defineMetaHandler(async (args) => {
    const movieCode = args.id.replace('topxx_', '');
    
    const data = await fetchMovies(1);
    const movie = data?.data?.find(m => m.code === movieCode);
    
    if (!movie) return { meta: null };
    
    const viTrans = movie.trans?.find(t => t.locale === 'vi') || movie.trans?.[0];
    
    return {
        meta: {
            id: 'topxx_' + movie.code,
            type: 'movie',
            name: viTrans?.title || 'Unknown',
            poster: movie.thumbnail,
            background: movie.thumbnail,
            description: viTrans?.description || '',
            releaseInfo: movie.publish_at ? new Date(movie.publish_at).getFullYear().toString() : '',
            runtime: movie.duration,
            genres: movie.genres?.map(g => {
                const viGenre = g.trans?.find(t => t.locale === 'vi');
                return viGenre?.name || g.code;
            }) || []
        }
    };
});

// Xử lý Stream (Nguồn phát)
builder.defineStreamHandler(async (args) => {
    const movieCode = args.id.replace('topxx_', '');
    
    const data = await fetchMovies(1);
    const movie = data?.data?.find(m => m.code === movieCode);
    
    if (!movie) return { streams: [] };
    
    const streams = movie.sources.map(source => ({
        name: `TopXX - ${source.type.toUpperCase()}`,
        description: `Chất lượng: ${movie.quality || 'HD'}`,
        url: source.link,
        behaviorHints: {
            notWebReady: true,
            proxyHeaders: {
                'User-Agent': 'Mozilla/5.0'
            }
        }
    }));
    
    return { streams };
});

// Khởi động server
const port = process.env.PORT || 7000;
serveHTTP(builder.getInterface(), { port });

console.log(`✅ Addon TopXX đang chạy tại: http://localhost:${port}/manifest.json`);
