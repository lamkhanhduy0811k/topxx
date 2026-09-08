// addon.js
const { addonBuilder, serveHTTP } = require('stremio-addon-sdk');
const axios = require('axios');
const cheerio = require('cheerio');

// Cấu hình
const API_BASE = 'https://topxx.vip/api/v1';
const BASE_URL = 'https://topxx.vip';
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const manifest = {
    id: 'org.topxx.cinema',
    version: '6.0.0',
    name: 'TopXX Cinema',
    description: 'Xem phim mới nhất - Bản bóc tách nguồn',
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
                'Referer': BASE_URL
            },
            timeout: 15000
        });
        return response.data;
    } catch (error) {
        console.error('❌ Lỗi API:', error.message);
        return null;
    }
}

// Hàm bóc tách link video gốc từ embed
async function extractStreamFromEmbed(embedUrl) {
    try {
        // Bước 1: Tải trang embed
        const response = await axios.get(embedUrl, {
            headers: {
                'User-Agent': USER_AGENT,
                'Referer': BASE_URL
            },
            timeout: 10000
        });
        
        const html = response.data;
        const $ = cheerio.load(html);
        
        const streams = [];
        
        // Bước 2: Tìm file .m3u8 (HLS) trực tiếp trong HTML
        const m3u8Matches = html.match(/https?:\/\/[^"'\s]+\.m3u8[^"'\s]*/g);
        if (m3u8Matches) {
            m3u8Matches.forEach((url, i) => {
                streams.push({
                    name: `HLS Server ${i + 1}`,
                    description: 'Nguồn HLS gốc',
                    url: url,
                    behaviorHints: {
                        notWebReady: true,
                        proxyHeaders: {
                            request: {
                                'User-Agent': USER_AGENT,
                                'Referer': embedUrl
                            }
                        }
                    }
                });
            });
        }
        
        // Bước 3: Tìm file .mp4 trực tiếp
        const mp4Matches = html.match(/https?:\/\/[^"'\s]+\.mp4[^"'\s]*/g);
        if (mp4Matches) {
            mp4Matches.forEach((url, i) => {
                streams.push({
                    name: `MP4 Server ${i + 1}`,
                    description: 'Nguồn MP4 gốc',
                    url: url,
                    behaviorHints: {
                        notWebReady: true,
                        proxyHeaders: {
                            request: {
                                'User-Agent': USER_AGENT,
                                'Referer': embedUrl
                            }
                        }
                    }
                });
            });
        }
        
        // Bước 4: Tìm link trong script JSON (thường là cấu hình player)
        $('script').each((i, elem) => {
            const content = $(elem).html() || '';
            const jsonUrls = content.match(/https?:\/\/[^"'\s]+(?:\.m3u8|\.mp4|\.webm)[^"'\s]*/g);
            if (jsonUrls) {
                jsonUrls.forEach((url, idx) => {
                    streams.push({
                        name: `JSON Server ${idx + 1}`,
                        description: 'Nguồn từ JSON',
                        url: url,
                        behaviorHints: {
                            notWebReady: true,
                            proxyHeaders: {
                                request: {
                                    'User-Agent': USER_AGENT,
                                    'Referer': embedUrl
                                }
                            }
                        }
                    });
                });
            }
        });
        
        // Bước 5: Tìm iframe lồng nhau (nếu embed chứa embed khác)
        $('iframe').each((i, elem) => {
            const nestedSrc = $(elem).attr('src');
            if (nestedSrc && nestedSrc.startsWith('http')) {
                streams.push({
                    name: `Nested Server ${i + 1}`,
                    description: 'Nguồn lồng nhau',
                    url: nestedSrc,
                    behaviorHints: {
                        notWebReady: true,
                        proxyHeaders: {
                            request: {
                                'User-Agent': USER_AGENT,
                                'Referer': embedUrl
                            }
                        }
                    }
                });
            }
        });
        
        return streams;
    } catch (error) {
        console.error('❌ Lỗi bóc tách:', error.message);
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

// Xử lý Stream - BÓC TÁCH NGUỒN GỐC
builder.defineStreamHandler(async (args) => {
    const movieCode = args.id.replace('topxx_', '');
    
    // Lấy dữ liệu từ API
    const data = await getMovies();
    const movie = data?.data?.find(m => m.code === movieCode);
    
    if (!movie || !movie.sources) {
        return { streams: [] };
    }
    
    const allStreams = [];
    
    // Lấy từng source và bóc tách
    for (const source of movie.sources) {
        if (source.type === 'embed' || source.link.includes('embed')) {
            // Bóc tách link gốc từ embed
            const extractedStreams = await extractStreamFromEmbed(source.link);
            allStreams.push(...extractedStreams);
        } else {
            // Nguồn trực tiếp (mp4, m3u8)
            allStreams.push({
                name: `TopXX Direct`,
                description: `${movie.quality || 'HD'}`,
                url: source.link,
                behaviorHints: {
                    notWebReady: true
                }
            });
        }
    }
    
    console.log(`✅ Bóc tách được ${allStreams.length} nguồn gốc cho ${movieCode}`);
    return { streams: allStreams };
});

// Khởi động server
const port = process.env.PORT || 7000;
serveHTTP(builder.getInterface(), { port });

console.log('✅ TopXX Cinema (Bản bóc tách) v6.0.0 đang chạy!');
console.log('🔗 URL: https://topxx-vjws.onrender.com/manifest.json');
