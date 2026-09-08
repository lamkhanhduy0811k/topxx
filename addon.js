// addon.js
const { addonBuilder, serveHTTP } = require('stremio-addon-sdk');
const axios = require('axios');
const cheerio = require('cheerio');

// Cấu hình
const BASE_URL = 'https://topxx.vip';
const API_BASE = 'https://topxx.vip/api/v1';

const manifest = {
    id: 'org.topxx.cinema',
    version: '2.0.0',
    name: 'TopXX Cinema',
    description: 'Xem phim mới nhất - Bản tự tìm nguồn',
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

// Hàm lấy danh sách phim từ API
async function getMovies() {
    try {
        const response = await axios.get(`${API_BASE}/movies/latest?page=1`, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': 'application/json',
                'Referer': BASE_URL
            },
            timeout: 10000
        });
        return response.data;
    } catch (error) {
        console.error('❌ Lỗi API:', error.message);
        return null;
    }
}

// Hàm lấy nguồn phát từ trang chi tiết phim (Scrape)
async function getStreamsFromPage(movieCode) {
    try {
        // Bước 1: Lấy link trang chi tiết phim
        const detailPage = await axios.get(`${BASE_URL}/phim/${movieCode}`, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            },
            timeout: 10000
        });
        
        const $ = cheerio.load(detailPage.data);
        
        // Bước 2: Tìm các iframe chứa link phát
        const streams = [];
        
        // Tìm iframe trong trang
        $('iframe').each((i, element) => {
            const src = $(element).attr('src');
            if (src) {
                streams.push({
                    name: `Server ${i + 1}`,
                    description: 'Nguồn từ trang web',
                    url: src,
                    behaviorHints: {
                        notWebReady: true,
                        proxyHeaders: {
                            request: {
                                'User-Agent': 'Mozilla/5.0',
                                'Referer': BASE_URL
                            }
                        }
                    }
                });
            }
        });
        
        // Bước 3: Tìm các link video trực tiếp (mp4, m3u8)
        $('video source').each((i, element) => {
            const src = $(element).attr('src');
            if (src) {
                streams.push({
                    name: `Video Server ${i + 1}`,
                    description: 'Video trực tiếp',
                    url: src,
                    behaviorHints: {
                        notWebReady: true
                    }
                });
            }
        });
        
        // Bước 4: Tìm các link trong script JSON (nếu có)
        const scripts = $('script').map((i, element) => $(element).html()).get().join(' ');
        const jsonMatches = scripts.match(/https?:\/\/[^"'\s]+\.(m3u8|mp4)[^"'\s]*/g);
        if (jsonMatches) {
            jsonMatches.forEach((url, i) => {
                streams.push({
                    name: `JSON Server ${i + 1}`,
                    description: 'Nguồn từ JSON',
                    url: url,
                    behaviorHints: {
                        notWebReady: true
                    }
                });
            });
        }
        
        return streams;
    } catch (error) {
        console.error('❌ Lỗi scrape:', error.message);
        return [];
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

// Xử lý Meta (Thông tin chi tiết)
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

// Xử lý Stream - TỰ TÌM NGUỒN PHÁT
builder.defineStreamHandler(async (args) => {
    const movieCode = args.id.replace('topxx_', '');
    
    // Cách 1: Lấy từ API (nếu có sources)
    const data = await getMovies();
    const movie = data?.data?.find(m => m.code === movieCode);
    
    if (movie?.sources?.length > 0) {
        const apiStreams = movie.sources.map((source, index) => ({
            name: `TopXX API Server ${index + 1}`,
            description: `${movie.quality || 'HD'}`,
            url: source.link,
            behaviorHints: {
                notWebReady: true,
                proxyHeaders: {
                    request: {
                        'User-Agent': 'Mozilla/5.0',
                        'Referer': BASE_URL
                    }
                }
            }
        }));
        
        console.log(`✅ API có ${apiStreams.length} nguồn cho ${movieCode}`);
        return { streams: apiStreams };
    }
    
    // Cách 2: Scrape từ trang web
    console.log('🔍 Đang tìm nguồn từ web cho:', movieCode);
    const scrapedStreams = await getStreamsFromPage(movieCode);
    
    if (scrapedStreams.length > 0) {
        console.log(`✅ Scrape được ${scrapedStreams.length} nguồn`);
        return { streams: scrapedStreams };
    }
    
    // Cách 3: Gọi API chi tiết phim (nếu có)
    try {
        const detailResponse = await axios.get(`${API_BASE}/movies/${movieCode}`, {
            headers: {
                'User-Agent': 'Mozilla/5.0',
                'Referer': BASE_URL
            },
            timeout: 10000
        });
        
        if (detailResponse.data?.sources?.length > 0) {
            return {
                streams: detailResponse.data.sources.map((s, i) => ({
                    name: `Detail Server ${i + 1}`,
                    url: s.link,
                    behaviorHints: { notWebReady: true }
                }))
            };
        }
    } catch (error) {
        console.error('❌ Lỗi API chi tiết:', error.message);
    }
    
    // Không tìm thấy nguồn nào
    console.log('⚠️ Không có nguồn cho:', movieCode);
    return { streams: [] };
});

// Khởi động server
const port = process.env.PORT || 7000;
serveHTTP(builder.getInterface(), { port });

console.log('✅ TopXX Cinema (Bản Scrape) đang chạy!');
console.log('🔗 URL: https://topxx-vjws.onrender.com/manifest.json');
