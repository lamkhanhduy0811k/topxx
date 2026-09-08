// addon.js
const { addonBuilder, serveHTTP } = require('stremio-addon-sdk');
const axios = require('axios');
const cheerio = require('cheerio');

const BASE_URL = 'https://topxx.vip';

const manifest = {
    id: 'org.topxx.cinema',
    version: '7.0.0',
    name: 'TopXX Cinema',
    description: 'Xem phim mới nhất - Bản Termux',
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

// Hàm lấy danh sách phim từ trang chủ web (SCRAPE thay vì dùng API)
async function getMovies() {
    try {
        const response = await axios.get(`${BASE_URL}/phim-moi`, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });
        const $ = cheerio.load(response.data);
        
        // Tìm các thẻ chứa phim trên trang web
        const movies = [];
        $('.movie-item, .film-item, .movie-row, .col-md-3').each((i, elem) => {
            const link = $(elem).find('a').attr('href');
            const title = $(elem).find('h3, .title, .movie-title').text().trim();
            const poster = $(elem).find('img').attr('src');
            
            if (link && title) {
                const code = link.replace('/phim/', '').replace('/', '');
                movies.push({
                    id: 'topxx_' + code,
                    type: 'movie',
                    name: title,
                    poster: poster || '',
                    background: poster || '',
                    description: 'Xem phim miễn phí',
                    releaseInfo: '',
                    runtime: '',
                    genres: []
                });
            }
        });
        
        return movies;
    } catch (error) {
        console.error('❌ Lỗi API:', error.message);
        return [];
    }
}

// Hàm lấy nguồn phát từ trang chi tiết phim
async function getStreamsFromPage(movieCode) {
    try {
        const detailPage = await axios.get(`${BASE_URL}/phim/${movieCode}`,
            {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                }
            }
        );
        
        const $ = cheerio.load(detailPage.data);
        const streams = [];
        
        // Tìm iframe embed
        $('iframe').each((i, elem) => {
            const src = $(elem).attr('src');
            if (src) {
                streams.push({
                    name: `Embed Server ${i + 1}`,
                    description: 'Nguồn phát',
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
        
        // Tìm link HLS/MP4 trực tiếp
        $('video source, source').each((i, elem) => {
            const src = $(elem).attr('src');
            if (src && (src.includes('.m3u8') || src.includes('.mp4'))) {
                streams.push({
                    name: `Video Server ${i + 1}`,
                    description: 'Nguồn video',
                    url: src,
                    behaviorHints: {
                        notWebReady: true
                    }
                });
            }
        });
        
        return streams;
    } catch (error) {
        console.error('❌ Lỗi lấy nguồn:', error.message);
        return [];
    }
}

// Xử lý Catalog
builder.defineCatalogHandler(async () => {
    const movies = await getMovies();
    return { metas: movies };
});

// Xử lý Meta
builder.defineMetaHandler(async (args) => {
    const movieCode = args.id.replace('topxx_', '');
    const movies = await getMovies();
    const movie = movies.find(m => m.id === 'topxx_' + movieCode);
    
    if (!movie) {
        return { meta: null };
    }
    
    return {
        meta: {
            id: movie.id,
            type: 'movie',
            name: movie.name,
            poster: movie.poster,
            background: movie.background,
            description: movie.description,
            releaseInfo: movie.releaseInfo,
            runtime: movie.runtime,
            genres: movie.genres
        }
    };
});

// Xử lý Stream
builder.defineStreamHandler(async (args) => {
    const movieCode = args.id.replace('topxx_', '');
    const streams = await getStreamsFromPage(movieCode);
    
    if (streams.length > 0) {
        return { streams };
    }
    
    // Nếu không tìm thấy, gọi API dự phòng
    try {
        const data = await axios.get(`https://topxx.vip/api/v1/movies/${movieCode}`);
        const movie = data.data;
        if (movie?.sources?.length > 0) {
            return {
                streams: movie.sources.map((s, i) => ({
                    name: `API Server ${i + 1}`,
                    url: s.link,
                    behaviorHints: { notWebReady: true }
                }))
            };
        }
    } catch (error) {
        console.error('❌ Lỗi dự phòng:', error.message);
    }
    
    return { streams: [] };
});

// Khởi động server
const port = process.env.PORT || 7000;
serveHTTP(builder.getInterface(), { port });

console.log('✅ TopXX Cinema v7.0.0 đang chạy!');
console.log('🔗 URL: http://localhost:' + port + '/manifest.json');
