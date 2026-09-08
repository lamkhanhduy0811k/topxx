// addon.js
const { addonBuilder, serveHTTP } = require('stremio-addon-sdk');
const axios = require('axios');

// Cấu hình API - DÙNG /movies/latest (có sources)
const API_BASE = 'https://topxx.vip/api/v1';
const USER_AGENT = 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36';

// Manifest addon
const manifest = {
    id: 'org.topxx.cinema',
    version: '1.1.0', // Tăng version để Stremio nhận diện addon mới
    name: 'TopXX Cinema',
    description: 'Xem phim mới nhất từ TopXX - Có nguồn phát',
    logo: 'https://i.imgur.com/abc123.png',
    resources: ['catalog', 'stream', 'meta'],
    types: ['movie'],
    catalogs: [
        {
            type: 'movie',
            id: 'topxx-latest',
            name: 'Phim Mới Nhất',
            extra: [
                { name: 'search', isRequired: false },
                { name: 'skip', isRequired: false }
            ]
        }
    ],
    idPrefixes: ['topxx_']
};

const builder = new addonBuilder(manifest);

// Hàm lấy dữ liệu từ /movies/latest (có sources)
async function fetchMovies(page = 1, searchTerm = '') {
    try {
        let url = `${API_BASE}/movies/latest?page=${page}`;
        if (searchTerm) {
            url = `${API_BASE}/movies/search?q=${encodeURIComponent(searchTerm)}`;
        }
        
        const response = await axios.get(url, {
            headers: {
                'User-Agent': USER_AGENT,
                'Accept': 'application/json'
            }
        });
        return response.data;
    } catch (error) {
        console.error('❌ Lỗi API:', error.message);
        return null;
    }
}

// Chuyển đổi dữ liệu sang định dạng Stremio
function transformToCatalog(movies) {
    return movies.map(movie => {
        const viTrans = movie.trans?.find(t => t.locale === 'vi') || movie.trans?.[0];
        
        return {
            id: 'topxx_' + movie.code,
            type: 'movie',
            name: viTrans?.title || 'Unknown',
            poster: movie.thumbnail,
            background: movie.thumbnail,
            description: viTrans?.description || 'Xem phim miễn phí',
            releaseInfo: movie.publish_at ? new Date(movie.publish_at).getFullYear().toString() : '',
            runtime: movie.duration,
            genres: movie.genres?.map(g => {
                const viGenre = g.trans?.find(t => t.locale === 'vi');
                return viGenre?.name || g.code;
            }) || ['Phim']
        };
    });
}

// Xử lý Catalog (Danh sách phim)
builder.defineCatalogHandler(async (args) => {
    try {
        const page = args.extra?.skip ? Math.floor(args.extra.skip / 30) + 1 : 1;
        const searchTerm = args.extra?.search || '';
        
        const data = await fetchMovies(page, searchTerm);
        
        if (!data || !data.data) {
            return { metas: [] };
        }
        
        const metas = transformToCatalog(data.data);
        
        return { metas };
    } catch (error) {
        console.error('Lỗi catalog:', error.message);
        return { metas: [] };
    }
});

// Xử lý Meta (Chi tiết phim)
builder.defineMetaHandler(async (args) => {
    try {
        const movieCode = args.id.replace('topxx_', '');
        
        const data = await fetchMovies(1);
        const movie = data?.data?.find(m => m.code === movieCode);
        
        if (!movie) {
            return { meta: null };
        }
        
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
    } catch (error) {
        return { meta: null };
    }
});

// Xử lý Stream (NGUỒN PHÁT - ĐÃ THÊM)
builder.defineStreamHandler(async (args) => {
    try {
        const movieCode = args.id.replace('topxx_', '');
        
        // Lấy dữ liệu từ API
        const data = await fetchMovies(1);
        const movie = data?.data?.find(m => m.code === movieCode);
        
        if (!movie) {
            return { streams: [] };
        }
        
        // Kiểm tra xem movie có sources không
        if (!movie.sources || movie.sources.length === 0) {
            console.log('❌ Phim không có nguồn phát:', movieCode);
            return { streams: [] };
        }
        
        // Tạo mảng streams từ sources
        const streams = movie.sources.map((source, index) => {
            const stream = {
                name: `TopXX - Server ${index + 1} (${source.type.toUpperCase()})`,
                description: `Chất lượng: ${movie.quality || 'HD'} - ${source.type}`,
                url: source.link,
            };

            // Xử lý riêng cho từng loại nguồn
            if (source.type === 'embed') {
                stream.behaviorHints = {
                    notWebReady: true,
                    proxyHeaders: {
                        request: {
                            'User-Agent': USER_AGENT,
                            'Referer': 'https://topxx.vip/'
                        }
                    }
                };
            } else if (source.link.includes('.m3u8')) {
                stream.behaviorHints = {
                    notWebReady: true
                };
            } else {
                stream.behaviorHints = {
                    notWebReady: true
                };
            }

            return stream;
        });
        
        return { streams };
    } catch (error) {
        console.error('Lỗi stream:', error.message);
        return { streams: [] };
    }
});

// Khởi động server
const port = process.env.PORT || 7000;
serveHTTP(builder.getInterface(), { port });

console.log('✅ TopXX Cinema Addon đang chạy!');
console.log(`🔗 URL: http://localhost:${port}/manifest.json`);
console.log('📱 Cài vào Stremio tại: http://YOUR_IP:' + port + '/manifest.json');
