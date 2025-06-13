from astrbot.api.event import filter, AstrMessageEvent #, MessageEventResult
from astrbot.api.star import Context, Star, register
from astrbot.api import logger
import aiohttp


@register(
    "epicreminder",
    "sffxzzp",
    "用于添加 Epic 免费游戏的提醒函数，可被其他定时插件调用。",
    "0.1",
)
class EpicReminder(Star):
    def __init__(self, context: Context):
        super().__init__(context)

    @filter.command("epicfree")
    @filter.llm_tool("epicfree")
    async def epicfree(self, event: AstrMessageEvent):
        """会列出当前免费的 Epic 游戏，地址由 pipedream 先行抓取，返回纯文本格式"""
        url = "https://gist.githubusercontent.com/sffxzzp/74bdb34bb28c50340c40f90fdfe394aa/raw"
        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(url) as response:
                    if response.status == 200:
                        data = await response.text()
                        logger.info("Fetched Epic free games data successfully.")
                        yield event.plain_result(data)
                    else:
                        logger.error(
                            f"Failed to fetch Epic free games data, status: {response.status}"
                        )
                        yield event.plain_result(
                            "无法获取 Epic 免费游戏数据，请稍后再试。"
                        )
        except Exception as e:
            logger.error(f"Exception occurred while fetching Epic free games data: {e}")
            yield event.plain_result("获取数据时出现错误，请稍后重试。")
