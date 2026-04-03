import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { unfurl } from 'unfurl.js';

const FETCH_TIMEOUT_MS = 10000;
const PREVIEW_CACHE_CONTROL = 'no-store';

type PreviewPayload = {
    url: string;
    title: string;
    description: string;
    image: string;
    thumbnail: string;
    siteName: string;
    domain: string;
    authorName?: string;
};

function safeText(value: unknown): string {
    return String(value || '').trim();
}

function extractXStatusId(target: URL): string {
    const match = target.pathname.match(/\/status\/(\d+)/i);
    return safeText(match?.[1]);
}

function normalizePreview(preview: Partial<PreviewPayload>, fallbackUrl: URL): PreviewPayload | null {
    const normalizedUrl = normalizePublicUrl(safeText(preview.url) || fallbackUrl.toString()) || fallbackUrl;
    const title = safeText(preview.title);
    const description = safeText(preview.description);
    const image = safeText(preview.image);
    const thumbnail = safeText(preview.thumbnail);
    const siteName = safeText(preview.siteName);
    const authorName = safeText(preview.authorName);

    const hasContent = Boolean(title || description || image || thumbnail || siteName || authorName);
    if (!hasContent) return null;

    return {
        url: normalizedUrl.toString(),
        title,
        description,
        image,
        thumbnail,
        siteName,
        domain: safeText(normalizedUrl.hostname),
        authorName: authorName || undefined
    };
}

function extractFirst<T>(value: T | T[] | undefined | null): T | null {
    if (Array.isArray(value)) return value[0] ?? null;
    return value ?? null;
}

function buildPreviewFromUnfurl(target: URL, data: any): PreviewPayload | null {
    const oEmbed = data?.oEmbed || {};
    const og = data?.open_graph || {};
    const twitter = data?.twitter_card || {};

    const ogImage = extractFirst(og?.images);
    const twitterImage = extractFirst(twitter?.images);
    const oembedThumb = extractFirst(oEmbed?.thumbnails);

    const preview = normalizePreview({
        url: safeText(og?.url) || safeText(data?.canonical_url) || target.toString(),
        title:
            safeText(oEmbed?.title) ||
            safeText(og?.title) ||
            safeText(twitter?.title) ||
            safeText(data?.title),
        description:
            safeText(og?.description) ||
            safeText(twitter?.description) ||
            safeText(data?.description),
        image:
            safeText(ogImage?.secure_url) ||
            safeText(ogImage?.url) ||
            safeText(twitterImage?.url) ||
            safeText(oEmbed?.url) ||
            safeText(oembedThumb?.url),
        thumbnail: safeText(oembedThumb?.url),
        siteName:
            safeText(oEmbed?.provider_name) ||
            safeText(og?.site_name) ||
            safeText(twitter?.site) ||
            safeText(target.hostname.replace(/^www\./i, '')),
        authorName:
            safeText(oEmbed?.author_name) ||
            safeText(twitter?.creator) ||
            safeText(data?.author)
    }, target);

    // If only thumbnail is present, elevate it as image so card can render large media.
    if (preview && !preview.image && preview.thumbnail) {
        preview.image = preview.thumbnail;
    }

    return preview;
}

async function fetchWithTimeout(fetchFn: typeof fetch, resource: string) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
        return await fetchFn(resource, {
            signal: controller.signal,
            headers: {
                'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'
            }
        });
    } finally {
        clearTimeout(timeout);
    }
}

async function fetchInstagramOEmbedPreview(fetchFn: typeof fetch, target: URL): Promise<PreviewPayload | null> {
    const host = safeText(target.hostname).toLowerCase();
    if (host !== 'instagram.com' && host !== 'www.instagram.com') return null;

    const endpoint = `https://www.instagram.com/api/v1/oembed/?url=${encodeURIComponent(target.toString())}`;
    try {
        const response = await fetchWithTimeout(fetchFn, endpoint);
        if (!response.ok) return null;
        const payload = await response.json().catch(() => null) as Record<string, unknown> | null;
        if (!payload || typeof payload !== 'object') return null;

        const authorName = safeText(payload.author_name);
        const title = safeText(payload.title) || (authorName ? `${authorName}, Instagram` : 'Instagram');
        const thumbnail = safeText(payload.thumbnail_url);

        return normalizePreview({
            url: target.toString(),
            title,
            description: '',
            image: thumbnail,
            thumbnail,
            siteName: safeText(payload.provider_name) || 'Instagram',
            authorName
        }, target);
    } catch {
        return null;
    }
}

async function fetchVXTwitterPreview(fetchFn: typeof fetch, target: URL): Promise<PreviewPayload | null> {
    const host = safeText(target.hostname).toLowerCase();
    if (host !== 'x.com' && host !== 'www.x.com' && host !== 'twitter.com' && host !== 'www.twitter.com') return null;

    const statusId = extractXStatusId(target);
    if (!statusId) return null;

    try {
        const response = await fetchWithTimeout(fetchFn, `https://api.vxtwitter.com/Twitter/status/${encodeURIComponent(statusId)}`);
        if (!response.ok) return null;
        const payload = await response.json().catch(() => null) as Record<string, unknown> | null;
        if (!payload || typeof payload !== 'object') return null;

        const userName = safeText(payload.user_name);
        const userHandle = safeText(payload.user_screen_name);
        const fullTitle = userName && userHandle
            ? `X'te ${userName} (@${userHandle})`
            : userName
                ? `X'te ${userName}`
                : 'X.com';

        let mediaImage = '';
        const mediaExtended = Array.isArray(payload.media_extended)
            ? payload.media_extended as Array<Record<string, unknown>>
            : [];
        for (const media of mediaExtended) {
            const mediaType = safeText(media?.type).toLowerCase();
            if (mediaType === 'image') {
                mediaImage = safeText(media?.url);
                if (mediaImage) break;
            }
            if (mediaType === 'video' || mediaType === 'gif') {
                mediaImage = safeText(media?.thumbnail_url);
                if (mediaImage) break;
            }
        }

        if (!mediaImage) {
            const mediaURLs = Array.isArray(payload.mediaURLs) ? payload.mediaURLs.map((item) => safeText(item)).filter(Boolean) : [];
            mediaImage = mediaURLs.find((item) => /\.(png|jpe?g|webp)(\?|$)/i.test(item)) || '';
        }

        return normalizePreview({
            url: safeText(payload.tweetURL) || target.toString(),
            title: fullTitle,
            description: safeText(payload.text),
            image: mediaImage,
            thumbnail: safeText(payload.user_profile_image_url),
            siteName: 'X (formerly Twitter)',
            authorName: userName
        }, target);
    } catch {
        return null;
    }
}

function isPrivateHostname(hostname: string): boolean {
    const h = String(hostname || '').toLowerCase();
    if (!h) return true;
    if (h === 'localhost' || h.endsWith('.localhost')) return true;
    if (h === '0.0.0.0') return true;

    // IPv4 private/link-local blocks.
    if (/^\d+\.\d+\.\d+\.\d+$/.test(h)) {
        const parts = h.split('.').map((part) => Number(part));
        if (parts.some((part) => !Number.isFinite(part) || part < 0 || part > 255)) return true;
        if (parts[0] === 10) return true;
        if (parts[0] === 127) return true;
        if (parts[0] === 169 && parts[1] === 254) return true;
        if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
        if (parts[0] === 192 && parts[1] === 168) return true;
    }

    return false;
}

function normalizePublicUrl(input: string): URL | null {
    try {
        const parsed = new URL(input);
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
        if (isPrivateHostname(parsed.hostname)) return null;
        parsed.hash = '';
        return parsed;
    } catch {
        return null;
    }
}

export const GET: RequestHandler = async ({ url, locals, fetch }) => {
    if (!locals.user) throw error(401, 'Unauthorized');

    const rawUrl = String(url.searchParams.get('url') || '').trim();
    if (!rawUrl) throw error(400, 'url gerekli');

    const target = normalizePublicUrl(rawUrl);
    if (!target) throw error(400, 'Geçersiz url');

    // Instagram pages often exceed unfurl.js size limit; oEmbed is the most reliable source.
    const instagramPreview = await fetchInstagramOEmbedPreview(fetch, target);
    if (instagramPreview) {
        return json({ preview: instagramPreview }, { headers: { 'cache-control': PREVIEW_CACHE_CONTROL } });
    }

    try {
        const unfurled = await unfurl(target.toString(), {
            oembed: true,
            timeout: FETCH_TIMEOUT_MS,
            follow: 5,
            compress: true,
            size: 5 * 1024 * 1024,
            headers: {
                'User-Agent': 'facebookexternalhit',
                'Accept': 'text/html, application/xhtml+xml'
            }
        });

        let preview = buildPreviewFromUnfurl(target, unfurled);

        // For X links, keep a richer fallback for tweet body/media/profile when metadata is sparse.
        const xPreview = await fetchVXTwitterPreview(fetch, target);
        if (xPreview) preview = xPreview;

        return json({ preview }, { headers: { 'cache-control': PREVIEW_CACHE_CONTROL } });
    } catch {
        // If unfurl fails, still try X fallback before giving up.
        const xPreview = await fetchVXTwitterPreview(fetch, target);
        if (xPreview) {
            return json({ preview: xPreview }, { headers: { 'cache-control': PREVIEW_CACHE_CONTROL } });
        }
        return json({ preview: null }, { status: 200 });
    }
};
