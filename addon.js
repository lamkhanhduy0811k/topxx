// addon.js
const { addonBuilder, serveHTTP } = require('stremio-addon-sdk');
const axios = require('axios');

// Cấu hình API
const API_BASE = 'https://topxx.vip/api/v1';
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// Manifest - Giữ nguyên version để Stremio không bị cache
const manifest = {
    id: 'org.topxx.cinema',
    version: '1.4.0', // Tăng version để ép Stremio cài lại
    name: 'TopXX Cinema',
    description: 'Xem phim mới nhất - Bản chống treo',
    resources: ['catalog', 'stream'],
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

// Hàm lấy dữ liệu - Dùng fetch thay vì axios cho nhẹ và tránh lỗi timeout
async function getMovies() {
    try {
        const response = await fetch(`${API_BASE}/movies/latest?page=1`, {
            method: 'GET',
            headers: {
                'User-Agent': USER_AGENT,
                'Accept': 'application/json',
                'Referer': 'https://topxx.vip/'
            },
            signal: AbortSignal.timeout(10000) // 10 giây
        });
        
        if (!response.ok) throw new Error('API lỗi: ' + response.status);
        return await response.json();
    } catch (error) {
        console.error('❌ Lỗi API:', error.message);
        return null;
    }
}

// Xử lý Catalog - Đảm bảo hiện phim
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
            genres: movie.genres?.map(g => g.trans?.[0]?.name || g.code) || []
        };
    });
    
    console.log(`✅ Đã lấy ${metas.length} phim`);
    return { metas };
});

// Xử lý Stream - Tìm nguồn phát, nếu không có thì trả về [] thay vì treo
builder.defineStreamHandler(async (args) => {
    try {
        const code = args.id.replace('topxx_', '');
        console.log('🔍 Đang tìm phim:', code);
        
        // Gọi API riêng cho phim này để lấy sources chính xác
        // Thử gọi API chi tiết phim (nếu có endpoint riêng)
        let movie = null;
        const data = await getMovies();
        movie = data?.data?.find(m => m.code === code);
        
        // Nếu không tìm thấy trong danh sách, thử gọi API chi tiết
        if (!movie) {
            try {
                const detailResponse = await fetch(`${API_BASE}/movies/${code}`, {
                    headers: { 'User-Agent': USER_AGENT }
                });
                if (detailResponse.ok) {
                    movie = await detailResponse.json();
                }
            } catch (e) {
                // Bỏ qua, dùng danh sách
            }
        }
        
        if (!movie || !movie.sources || movie.sources.length === 0) {
            console.log('⚠️ Không có nguồn cho:', code);
            return { streams: [] };
        }
        
        // Tạo streams
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
        
        console.log(`✅ Tìm thấy ${streams.length} nguồn cho ${code}`);
        return { streams };
    } catch (error) {
        console.error('❌ Lỗi stream:', error.message);
        return { streams: [] };
    }
});

// Khởi động server
const port = process.env.PORT || 7000;
serveHTTP(builder.getInterface(), { port });

console.log('✅ TopXX Cinema (Bản chống treo) đang chạy!');
console.log('🔗 URL: https://topxx-vjws.onrender.com/manifest.json');
