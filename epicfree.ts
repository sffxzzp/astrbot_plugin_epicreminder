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

async function fetchGames(): Promise<string> {
	const pc = await getPCGames();
	const android = await getMobileGames('android');
	const ios = await getMobileGames('ios');

	let result = '';

	if (pc.length > 0) {
		result += 'PC:\n\n';
		for (const g of pc) {
			result += `${g.title}\n${g.url}\n\n`;
		}
	}

	if (android.length > 0) {
		result += 'Android:\n\n';
		for (const g of android) {
			result += `${g.title}\n${g.url}\n\n`;
		}
	}

	if (ios.length > 0) {
		result += 'iOS:\n\n';
		for (const g of ios) {
			result += `${g.title}\n${g.url}\n\n`;
		}
	}

	return result || 'No free games found.';
}

function getETDate() {
	const now = new Date();
	const etStr = now.toLocaleString('en-US', { timeZone: 'America/New_York' });
	return new Date(etStr);
}

function needUpdate(et: Date): boolean {
	return et.getDay() === 4 && et.getHours() >= 11;
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

Deno.serve(async (_req) => {
	const kv = await Deno.openKv();

	const nowET = getETDate();
	const thisWeek = getWeekNumber(nowET);

	const [{ value: cachedData }, { value: lastUpdateWeek }] = await Promise.all([
		kv.get<string>(['epic', 'free-games', 'latest']),
		kv.get<string>(['epic', 'free-games', 'last-update-week']),
	]);

	const needInitialFetch = !cachedData;
	const needWeeklyFetch = needUpdate(nowET) && lastUpdateWeek !== thisWeek;

	if (needInitialFetch || needWeeklyFetch) {
		console.log('fetching...');
		const newData = await fetchGames();

		if (newData !== cachedData || needInitialFetch) {
			await kv.set(['epic', 'free-games', 'latest'], newData);
			await kv.set(['epic', 'free-games', 'timestamp'], Date.now());
			await kv.set(['epic', 'free-games', 'last-update-week'], thisWeek);
		}

		return new Response(newData, {
			headers: { 'Content-Type': 'text/plain; charset=utf-8' },
		});
	}

	console.log('using cached data.')
	return new Response(cachedData ?? 'No cached data available.', {
		headers: { 'Content-Type': 'text/plain; charset=utf-8' },
	});
});
