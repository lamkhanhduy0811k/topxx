// addon.js
const { addonBuilder, serveHTTP } = require('stremio-addon-sdk');
const axios = require('axios');
const cheerio = require('cheerio');

// Cấu hình
const DOMAIN = 'https://topxx.vip'; // Trang web phim
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const manifest = {
    id: 'org.topxx.cinema',
    version: '8.0.0',
    name: 'TopXX Cinema',
    description: 'Xem phim mới nhất - Bản link trực tiếp',
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

// Hàm lấy danh sách phim từ trang chủ
async function getMovies() {
    try {
        const response = await axios.get(`${DOMAIN}/phim-moi`, {
            headers: { 'User-Agent': USER_AGENT }
        });
        
        const $ = cheerio.load(response.data);
        const movies = [];
        
        $('.movie-item, .film-item, .movie-row').each((i, elem) => {
            const link = $(elem).find('a').attr('href');
            const title = $(elem).find('.title, h3').text().trim();
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
                    genres: []
                });
            }
        });
        
        return movies;
    } catch (error) {
        console.error('❌ Lỗi lấy phim:', error.message);
        return [];
    }
}

// Hàm lấy link video trực tiếp (HLS/MP4) từ trang chi tiết phim
async function getStreams(movieCode) {
    try {
        const response = await axios.get(`${DOMAIN}/phim/${movieCode}`,
            {
                headers: { 'User-Agent': USER_AGENT }
            }
        );
        
        const $ = cheerio.load(response.data);
        const streams = [];
        
        // Tìm link .m3u8 hoặc .mp4 trực tiếp trong HTML (bất kỳ vị trí nào)
        const html = response.data;
        const videoUrls = html.match(/https?:\/\/[^"'\s]+\.(m3u8|mp4)[^"'\s]*/g);
        
        if (videoUrls) {
            videoUrls.forEach((url, i) => {
                streams.push({
                    name: `Video Server ${i + 1}`,
                    description: 'Nguồn video trực tiếp',
                    url: url,
                    behaviorHints: {
                        notWebReady: true
                    }
                });
            });
        }
        
        // Tìm link trong iframe (nếu có thì ghi nhận nhưng chú ý: Stremio không phát iframe)
        $('iframe').each((i, elem) => {
            const src = $(elem).attr('src');
            if (src && (src.includes('.m3u8') || src.includes('.mp4'))) {
                streams.push({
                    name: `Embed Server ${i + 1}`,
                    description: 'Nguồn embed có link trực tiếp',
                    url: src,
                    behaviorHints: {
                        notWebReady: true,
                        proxyHeaders: {
                            request: {
                                'User-Agent': USER_AGENT,
                                'Referer': DOMAIN
                            }
                        }
                    }
                });
            }
        });
        
        // Tìm video trong script JSON
        $('script').each((i, elem) => {
            const content = $(elem).html() || '';
            const scriptUrls = content.match(/https?:\/\/[^"'\s]+\.(m3u8|mp4)[^"'\s]*/g);
            if (scriptUrls) {
                scriptUrls.forEach((url, idx) => {
                    streams.push({
                        name: `JSON Server ${idx + 1}`,
                        description: 'Nguồn từ JSON',
                        url: url,
                        behaviorHints: {
                            notWebReady: true,
                            proxyHeaders: {
                                request: {
                                    'User-Agent': USER_AGENT,
                                    'Referer': DOMAIN
                                }
                            }
                        }
                    });
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
            genres: movie.genres
        }
    };
});

// Xử lý Stream
builder.defineStreamHandler(async (args) => {
    const movieCode = args.id.replace('topxx_', '');
    const streams = await getStreams(movieCode);
    
    return { streams };
});

// Khởi động server
const port = process.env.PORT || 7000;
serveHTTP(builder.getInterface(), { port });

console.log('✅ TopXX Cinema v8.0.0 đang chạy!');
console.log('🔗 URL: http://localhost:' + port + '/manifest.json');
