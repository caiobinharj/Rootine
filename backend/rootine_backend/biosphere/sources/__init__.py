from .inea import collect_inea_events
from .rss_news import NEWS_SOURCES, collect_news
from .sympla import collect_sympla_events

__all__ = [
    "NEWS_SOURCES",
    "collect_news",
    "collect_sympla_events",
    "collect_inea_events",
]
