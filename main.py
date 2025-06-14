from astrbot.api.event import filter, AstrMessageEvent  # , MessageEventResult
from astrbot.api.star import Context, Star, register
from astrbot.api import logger
import aiohttp


@register(
    "epicreminder",
    "sffxzzp",
    "用于添加 Epic 免费游戏的提醒函数，可被其他定时插件调用。",
    "0.4",
)
class EpicReminder(Star):
    def __init__(self, context: Context):
        super().__init__(context)

    @filter.command("epicfree")
    async def epicfree(self, event: AstrMessageEvent, llm: bool = False):
        """会列出当前免费的 Epic 游戏，地址由 pipedream 先行抓取，返回纯文本格式"""
        url = "https://epicfree.deno.dev"
        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(url) as response:
                    if response.status == 200:
                        if llm:
                            data = (
                                "以下是当前免费的 Epic 游戏列表，分为多个平台，请转换为提醒文本发送给用户。不支持 markdown 格式，请输出纯文本格式。\n\n"
                                + await response.text()
                            )
                        else:
                            data = await response.text()
                        logger.info("Fetched Epic free games data successfully.")
                        return event.plain_result(data)
                    else:
                        logger.error(
                            f"Failed to fetch Epic free games data, status: {response.status}"
                        )
                        return event.plain_result(
                            "无法获取 Epic 免费游戏数据，请稍后再试。"
                        )
        except Exception as e:
            logger.error(f"Exception occurred while fetching Epic free games data: {e}")
            return event.plain_result("获取数据时出现错误，请稍后重试。")

    @filter.llm_tool("epicfree")
    async def epicfree_llm(self, event: AstrMessageEvent):
        """LLM 工具函数，返回 Epic 免费游戏的列表，添加提示词在前面以保证输出纯文本。"""
        return await self.epicfree(event, llm=True)
