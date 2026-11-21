from astrbot.api.event import filter, AstrMessageEvent  # , MessageEventResult
from astrbot.api.star import Context, Star, register
from astrbot.api import logger
from curl_cffi import AsyncSession
import asyncio

@register(
    "epicreminder",
    "sffxzzp",
    "用于添加 Epic 免费游戏的提醒函数，可被其他定时插件调用，定时提醒功能开发中。",
    "0.7",
)
class EpicReminder(Star):
    def __init__(self, context: Context):
        super().__init__(context)

    async def fetch(self, url: str):
        """异步获取 JSON 数据"""
        async with AsyncSession() as session:
            try:
                response = await session.get(url, impersonate="chrome")
                response.raise_for_status()
                return response.json()
            except Exception as e:
                logger.error(f"Error fetching data from {url}: {e}")
                return ""
    
    async def getPC(self):
        """获取当前免费的 Epic 游戏列表，返回 PC 平台的游戏"""
        result = []
        url = "https://store-site-backend-static-ipv4.ak.epicgames.com/freeGamesPromotions"
        data = await self.fetch(url)
        for item in data['data']['Catalog']['searchStore']['elements']:
            if {"path": "freegames"} in item['categories'] and item["price"]["totalPrice"]["discountPrice"] == 0 and (item['offerType'] == 'BASE_GAME' or item['offerType'] == 'EDITION' or item['offerType'] == 'OTHERS') and item['productSlug'] != "[]":
                urlSlug = item['catalogNs']['mappings'][0]['pageSlug'] if len(item['catalogNs']['mappings']) > 0 else item['productSlug']
                result.append({'title': item['title'], 'url': 'https://store.epicgames.com/zh-CN/p/%s' % urlSlug})
        return result
    
    async def getMobile(self, platform="android"):
        """获取当前免费的 Epic 游戏列表，返回 Android 或 iOS 平台的游戏"""
        result = []
        url = "https://egs-platform-service.store.epicgames.com/api/v2/public/discover/home?count=10&country=US&locale=zh-CN&platform=%s&start=0&store=EGS" % platform
        data = await self.fetch(url)
        for cate in data['data']:
            if cate['type'] == 'freeGame':
                for item in cate['offers']:
                    result.append({'title': item['content']['title'], 'url': 'https://store.epicgames.com/zh-CN/p/%s' % item['content']['mapping']['slug']})
        return result
    
    async def getGames(self):
        """获取当前免费的 Epic 游戏列表，返回所有平台的游戏"""
        pc_games = await self.getPC()
        android_games = await self.getMobile("android")
        ios_games = await self.getMobile("ios")
        result = ''
        if pc_games:
            result += "PC:\n\n"
            for game in pc_games:
                result += "%s\n%s\n\n" % (game['title'], game['url'])
        if android_games:
            result += "Android:\n\n"
            for game in android_games:
                result += "%s\n%s\n\n" % (game['title'], game['url'])
        if ios_games:
            result += "iOS:\n\n"
            for game in ios_games:
                result += "%s\n%s\n\n" % (game['title'], game['url'])
        if not result:
            return None
        return result.strip()

    @filter.command("epicfree")
    async def epicfree(self, event: AstrMessageEvent, llm: bool = False):
        """会列出当前免费的 Epic 游戏，地址由 pipedream 先行抓取，返回纯文本格式"""
        gameData = await self.getGames()
        if not gameData:
            msg = "无法获取 Epic 免费游戏数据，请稍后再试。"
            return msg if llm else event.plain_result(msg)
        if llm:
            gameData = "请将以下 Epic 免费游戏列表整理成一条自然、有趣的中文提醒消息。\n像朋友分享福利一样，加入亲切、活泼的开场白，提醒大家别忘了领取。每次尝试使用不同的表达方式，避免重复和固定模板。\n可以适当使用 Emoji，但尽量使用纯文本，避免 Markdown 格式。\n完整保留游戏名称和链接，不要编造信息。只输出最终提醒内容。\n\n" + gameData
            return gameData
        return event.plain_result(gameData)

    @filter.llm_tool("epicfree")
    async def epicfree_llm(self, event: AstrMessageEvent):
        """LLM 工具函数，返回 Epic 免费游戏的列表，添加提示词在前面以保证输出纯文本。"""
        return await self.epicfree(event, llm=True)
