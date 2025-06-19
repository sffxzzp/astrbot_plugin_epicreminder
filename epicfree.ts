const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36 Edg/133.0.0.0';

async function getMobileGames(platform: string) {
	const res = await fetch(`https://egs-platform-service.store.epicgames.com/api/v2/public/discover/home?count=10&country=US&locale=zh-CN&platform=${platform}&start=0&store=EGS`, { headers: { 'User-Agent': ua } });

	const push: { title: string; url: string }[] = [];
	if (res.ok) {
		const json = await res.json();
		for (const cate of json.data) {
			if (cate.type === 'freeGame') {
				for (const item of cate.offers) {
					push.push({
						title: item.content.title,
						url: `https://store.epicgames.com/p/${item.content.mapping.slug}`,
					});
				}
			}
		}
	}

	return push;
}

async function getPCGames() {
	const res = await fetch('https://store-site-backend-static-ipv4.ak.epicgames.com/freeGamesPromotions', { headers: { 'User-Agent': ua } });

	const push: { title: string; url: string }[] = [];
	if (res.ok) {
		const json = await res.json();
		for (const item of json.data.Catalog.searchStore.elements) {
			const isFreeGame = item.categories.some((c: any) => c.path === 'freegames');
			const price = item.price.totalPrice;

			if (isFreeGame && price.discountPrice === 0 && price.originalPrice !== 0 && item.offerType === 'BASE_GAME') {
				const slug = item.catalogNs.mappings?.[0]?.pageSlug || item.productSlug;
				push.push({
					title: item.title,
					url: `https://store.epicgames.com/p/${slug}`,
				});
			}
		}
	}

	return push;
}

function getETDate() {
	const now = new Date();
	const etStr = now.toLocaleString('en-US', { timeZone: 'America/New_York' });
	return new Date(etStr);
}

function needUpdate(et: Date): boolean {
	return et.getDay() === 4 && (et.getHours() > 11 || (et.getHours() === 11 && et.getMinutes() >= 5));
}

function getWeekNumber(d: Date): string {
	const target = new Date(d.valueOf());
	const dayNr = (d.getDay() + 6) % 7;
	target.setDate(target.getDate() - dayNr + 3);
	const firstThursday = new Date(target.getFullYear(), 0, 4);
	const diff = target.getTime() - firstThursday.getTime();
	const week = 1 + Math.floor(diff / (7 * 24 * 60 * 60 * 1000));
	return `${target.getFullYear()}-W${week}`;
}

async function clearAllKv(kv: Deno.Kv, prefix: Deno.KvKey = []) {
	const entries = kv.list({ prefix });
	for await (const entry of entries) {
		await kv.delete(entry.key);
	}
}

function formatDateET(date: Date): string {
	const formatter = new Intl.DateTimeFormat('zh-CN', {
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
		hour: '2-digit',
		minute: '2-digit',
		second: '2-digit',
		hour12: false,
		timeZone: 'America/New_York',
	});
	const parts = formatter.formatToParts(date);
	// parts 是数组，可以拼接成 YYYY-MM-DD HH:mm:ss 格式
	const map: Record<string, string> = {};
	for (const part of parts) {
		if (part.type !== 'literal') {
			map[part.type] = part.value;
		}
	}
	return `${map.year}-${map.month}-${map.day} ${map.hour}:${map.minute}:${map.second}`;
}


function formatDateGMT8(date: Date | number): string {
	if (typeof date === 'number') date = new Date(date);
	const pad = (n: number) => n.toString().padStart(2, '0');
	const utc = date.getTime();
	const offset = 8 * 60 * 60 * 1000;
	const dateGMT8 = new Date(utc + offset);
	return `${dateGMT8.getUTCFullYear()}-${pad(dateGMT8.getUTCMonth() + 1)}-${pad(dateGMT8.getUTCDate())} ${pad(dateGMT8.getUTCHours())}:${pad(dateGMT8.getUTCMinutes())}:${pad(dateGMT8.getUTCSeconds())}`;
}

Deno.serve(async (_req) => {
	const kv = await Deno.openKv();
	const nowET = getETDate();
	const thisWeek = getWeekNumber(nowET);

	const url = new URL(_req.url);
	const refresh = url.searchParams.get('refresh') === 'true';

	if (refresh) {
		console.log('Refreshing all cache...');
		await clearAllKv(kv);
	}

	// 读取缓存
	const [
		pcCache, androidCache, iosCache,
		pcWeek, androidWeek, iosWeek,
		timestamp
	] = await Promise.all([
		kv.get<string>(['pc', 'latest']),
		kv.get<string>(['android', 'latest']),
		kv.get<string>(['ios', 'latest']),
		kv.get<string>(['pc', 'last-update-week']),
		kv.get<string>(['android', 'last-update-week']),
		kv.get<string>(['ios', 'last-update-week']),
		kv.get<string>(['timestamp']),
	]);

	let [pc, android, ios] = [pcCache.value, androidCache.value, iosCache.value];

	if (!pc || refresh || (needUpdate(nowET) && pcWeek.value !== thisWeek)) {
		const data = await getPCGames();
		pc = 'PC:\n\n' + data.map(g => `${g.title}\n${g.url}\n`).join('\n');
		await kv.set(['pc', 'latest'], pc, { expirationTtl: 604800 });
		await kv.set(['pc', 'last-update-week'], thisWeek, { expirationTtl: 604800 });
		await kv.set(['timestamp'], new Date().getTime());
	}

	if (!android || refresh || (needUpdate(nowET) && androidWeek.value !== thisWeek)) {
		const data = await getMobileGames('android');
		android = 'Android:\n\n' + data.map(g => `${g.title}\n${g.url}\n`).join('\n');
		await kv.set(['android', 'latest'], android, { expirationTtl: 604800 });
		await kv.set(['android', 'last-update-week'], thisWeek, { expirationTtl: 604800 });
		await kv.set(['timestamp'], new Date().getTime());
	}

	if (!ios || refresh || (needUpdate(nowET) && iosWeek.value !== thisWeek)) {
		const data = await getMobileGames('ios');
		ios = 'iOS:\n\n' + data.map(g => `${g.title}\n${g.url}\n`).join('\n');
		await kv.set(['ios', 'latest'], ios, { expirationTtl: 604800 });
		await kv.set(['ios', 'last-update-week'], thisWeek, { expirationTtl: 604800 });
		await kv.set(['timestamp'], new Date().getTime());
	}

	const result = [
		pc, android, ios,
		timestamp?.value ? `Cache time:\nET: ${formatDateET(timestamp.value)}\nAsia/Shanghai: ${formatDateGMT8(timestamp.value)}` : ''
	].filter(Boolean).join('\n\n') || 'No free games found.';
	return new Response(result, {
		headers: { 'Content-Type': 'text/plain; charset=utf-8' },
	});
});
