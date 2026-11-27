"""Build the static site at https://akhub.akfamily.xyz/.

README.md becomes index.html and README.en.md becomes en/index.html, so the
README files stay the only source of content. Entries written in the standard
three-line format become cards that can be searched and filtered by tag; any
other Markdown in a section is rendered as it is. The build also writes
sitemap.xml and robots.txt. Run locally with:

    pip install -r .github/scripts/requirements-site.txt
    python .github/scripts/build_site.py
    python -m http.server -d _site 8000
"""

import datetime
import html
import re
import sys
from pathlib import Path
from urllib.parse import urlsplit

from markdown_it import MarkdownIt
from mdit_py_plugins.anchors import anchors_plugin

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "_site"
REPO = "https://github.com/akfamily/akhub"
SITE = "https://akhub.akfamily.xyz/"
HOME = "https://akfamily.xyz/"

PAGES = [
    {
        "src": "README.md",
        "dst": "index.html",
        "lang": "zh-CN",
        "url": SITE,
        "home": "AKFamily 主页",
        "repo": "GitHub 仓库",
        "edit": "在 GitHub 上编辑",
        "updated": "内容来自仓库的 README，合并到 main 后自动更新。",
        "other_lang": "English",
        "other_href": "en/",
        "search": "搜索名称、简介或标签",
        "sections": "分类导航",
        "groups": {"price": "费用", "access": "访问", "market": "市场"},
        "stats": "收录 {entries} 个条目，分为 {sections} 类",
        "showing": "显示 {n} / {total} 条",
        "clear": "清除筛选",
        "empty": "没有符合条件的条目，换个关键词或减少筛选条件试试。",
        "top": "回到顶部",
        "theme": "切换浅色或深色模式",
        # Relative links in README.md, rewritten for the site.
        "links": {"README.en.md": "en/", "README.md": "./"},
    },
    {
        "src": "README.en.md",
        "dst": "en/index.html",
        "lang": "en",
        "url": SITE + "en/",
        "home": "AKFamily",
        "repo": "GitHub",
        "edit": "Edit on GitHub",
        "updated": "Generated from the repository README and updated on every merge to main.",
        "other_lang": "简体中文",
        "other_href": "../",
        "search": "Search by name, description or tag",
        "sections": "Sections",
        "groups": {"price": "Pricing", "access": "Access", "market": "Market"},
        "stats": "{entries} entries in {sections} categories",
        "showing": "Showing {n} of {total}",
        "clear": "Clear filters",
        "empty": "No entries match. Try another keyword or remove some filters.",
        "top": "Back to top",
        "theme": "Switch between light and dark mode",
        "links": {"README.md": "../", "README.en.md": "./"},
    },
]

PRICING_TAGS = {"免费", "免费增值", "付费", "Free", "Freemium", "Paid"}
ACCESS_TAGS = {"API"}

ENTRY_RE = re.compile(r"^- \[([^\]]+)\]\((https?://[^)\s]+)\)\s*$")
SUB_RE = re.compile(r"^  - (.+)$")
TAG_LINE_RE = re.compile(r"^(?:`[^`]+`\s*)+$")
TOC_ITEM_RE = re.compile(r"^- \[[^\]]+\]\(#[^)]+\)\s*$")
LANG_LINE_RE = re.compile(r"^[^|]*\|[^|]*$")


def esc(text):
    return html.escape(text, quote=True)


def github_slug(text):
    """Heading anchor compatible with GitHub, so README TOC links keep working."""
    text = text.strip().lower()
    text = re.sub(r"[^\w\- ]", "", text)
    return text.replace(" ", "-")


def make_renderer(links):
    md = MarkdownIt("commonmark", {"html": False}).enable("table")
    md.use(anchors_plugin, min_level=1, max_level=3, slug_func=github_slug)

    def link_open(self, tokens, idx, options, env):
        token = tokens[idx]
        href = token.attrGet("href") or ""
        if href in links:
            token.attrSet("href", links[href])
        elif re.match(r"^[\w.-]+\.(md|txt)$|^LICENSE$", href):
            token.attrSet("href", f"{REPO}/blob/main/{href}")
        elif href.startswith(("http://", "https://")):
            token.attrSet("target", "_blank")
            token.attrSet("rel", "noopener")
        return self.renderToken(tokens, idx, options, env)

    md.add_render_rule("link_open", link_open)
    return md


def split_sections(text):
    """Split a README into the lines before the first H2 and its H2 sections."""
    preamble, sections, current = [], [], None
    for line in text.splitlines():
        if line.startswith("## "):
            current = {"title": line[3:].strip(), "lines": []}
            sections.append(current)
        elif current is None:
            preamble.append(line)
        else:
            current["lines"].append(line)
    return preamble, sections


def parse_entries(lines):
    """Return (other Markdown lines, entries) for the lines of one section."""
    prose, entries, entry = [], [], None
    for line in lines:
        match = ENTRY_RE.match(line)
        if match:
            entry = {"name": match.group(1), "url": match.group(2), "desc": [], "tags": []}
            entries.append(entry)
            continue
        match = SUB_RE.match(line)
        if match and entry is not None:
            text = match.group(1).strip()
            if TAG_LINE_RE.match(text):
                entry["tags"] = re.findall(r"`([^`]+)`", text)
            else:
                entry["desc"].append(text)
            continue
        if line.strip():
            entry = None
        prose.append(line)
    return prose, entries


def is_toc(lines):
    items = [line for line in lines if line.strip()]
    return bool(items) and all(TOC_ITEM_RE.match(line) for line in items)


def tag_group(tag):
    if tag in PRICING_TAGS:
        return "price"
    if tag in ACCESS_TAGS:
        return "access"
    return "market"


def ordered_tags(sections):
    """Tags in the order of the README tag table, then any others in use."""
    order = []
    for section in sections:
        if not section["entries"]:
            for line in section["lines"]:
                if line.lstrip().startswith("|"):
                    order.extend(re.findall(r"`([^`]+)`", line))
    used = [tag for s in sections for e in s["entries"] for tag in e["tags"]]
    result = []
    for tag in order + used:
        if tag in used and tag not in result:
            result.append(tag)
    return result


def render_card(md, entry):
    url = urlsplit(entry["url"])
    host = (url.hostname or "").removeprefix("www.")
    if host == "github.com":
        host += "/" + "/".join(url.path.strip("/").split("/")[:2])
    desc = "".join(f"<p>{md.renderInline(text)}</p>" for text in entry["desc"])
    tags = "".join(
        f'<button type="button" class="tag" data-tag="{esc(tag)}">{esc(tag)}</button>'
        for tag in entry["tags"]
    )
    return (
        f'<article class="card" data-tags="{esc("|".join(entry["tags"]))}">'
        f'<h3><a href="{esc(entry["url"])}" target="_blank" rel="noopener">{esc(entry["name"])}</a></h3>'
        f'<div class="desc">{desc}</div>'
        f'<div class="meta"><span class="tags">{tags}</span><span class="host">{esc(host)}</span></div>'
        "</article>"
    )


def render_filters(page, tags):
    groups = {"price": [], "access": [], "market": []}
    for tag in tags:
        groups[tag_group(tag)].append(tag)
    rows = []
    for key, members in groups.items():
        if not members:
            continue
        chips = "".join(
            f'<button type="button" class="chip" data-group="{key}" data-tag="{esc(tag)}" '
            f'aria-pressed="false">{esc(tag)}</button>'
            for tag in members
        )
        rows.append(
            f'<div class="fgroup"><span class="flabel">{esc(page["groups"][key])}</span>'
            f'<span class="fchips">{chips}</span></div>'
        )
    return (
        f'<div class="filters" id="filters" data-showing="{esc(page["showing"])}">'
        + "".join(rows)
        + '<div class="fstatus"><span id="status"></span>'
        f'<button type="button" id="clear" hidden>{esc(page["clear"])}</button></div></div>'
        f'<p class="empty" id="empty" hidden>{esc(page["empty"])}</p>'
    )


def render_page(page, text):
    md = make_renderer(page["links"])
    preamble, sections = split_sections(text)
    sections = [s for s in sections if not is_toc(s["lines"])]
    for section in sections:
        section["slug"] = github_slug(section["title"])
        section["prose"], section["entries"] = parse_entries(section["lines"])
    # Reference sections that come before the first list (the tag legend) move
    # below the lists, so that entries are visible without scrolling.
    listed = [i for i, s in enumerate(sections) if s["entries"]]
    if listed:
        first, last = listed[0], listed[-1]
        sections = sections[first : last + 1] + sections[:first] + sections[last + 1 :]

    title = next(line[2:].strip() for line in preamble if line.startswith("# "))
    intro = [
        line
        for line in preamble
        if not line.startswith("# ")
        and not ("README" in line and ".md)" in line and LANG_LINE_RE.match(line))
    ]
    total = sum(len(s["entries"]) for s in sections)
    stats = page["stats"].format(
        entries=total, sections=sum(1 for s in sections if s["entries"])
    )

    nav, body, filters_done = [], [], False
    for section in sections:
        slug, count = esc(section["slug"]), len(section["entries"])
        badge = f'<span class="n" data-count="{slug}">{count}</span>' if count else ""
        nav.append(
            f'<a href="#{slug}" data-nav="{slug}"><span>{esc(section["title"])}</span>{badge}</a>'
        )
        if count and not filters_done:
            body.append(render_filters(page, ordered_tags(sections)))
            filters_done = True
        prose = "\n".join(section["prose"]).strip()
        parts = [
            f'<section class="sec" data-sec="{slug}"{" data-entries" if count else ""}>',
            f'<h2 id="{slug}"><a href="#{slug}">{esc(section["title"])}</a>'
            + (f'<span class="count" data-count="{slug}">{count}</span>' if count else "")
            + "</h2>",
        ]
        if prose:
            parts.append(md.render(prose))
        if count:
            cards = "".join(render_card(md, entry) for entry in section["entries"])
            parts.append(f'<div class="cards">{cards}</div>')
        parts.append("</section>")
        body.append("\n".join(parts))

    hero = (
        f'<section class="hero"><h1>{esc(title)}</h1>\n'
        f'{md.render(chr(10).join(intro).strip())}'
        f'<p class="stats">{esc(stats)}</p></section>'
    )
    return title, "\n".join(nav), hero + "\n" + "\n".join(body)


TEMPLATE = """<!doctype html>
<html lang="{lang}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light dark">
  <meta name="theme-color" content="#ffffff" media="(prefers-color-scheme: light)">
  <meta name="theme-color" content="#0e1116" media="(prefers-color-scheme: dark)">
  <title>{title} — AKFamily</title>
  <meta name="description" content="{description}">
  <link rel="canonical" href="{url}">
  <link rel="alternate" hreflang="zh-CN" href="{site}">
  <link rel="alternate" hreflang="en" href="{site}en/">
  <meta property="og:type" content="website">
  <meta property="og:title" content="{title}">
  <meta property="og:description" content="{description}">
  <meta property="og:url" content="{url}">
  <meta property="og:image" content="https://akfamily.xyz/assets/og/akhub.png">
  <meta property="og:image:width" content="1280">
  <meta property="og:image:height" content="640">
  <meta name="twitter:card" content="summary_large_image">
  <link rel="icon" href="{home_url}favicon.ico">
  <script>(function(r){{r.className="js";try{{var t=localStorage.getItem("akhub-theme");if(t==="dark"||t==="light")r.setAttribute("data-theme",t)}}catch(e){{}}}})(document.documentElement)</script>
  <style>{css}</style>
</head>
<body id="top">
  <header class="nav">
    <div class="wrap nav-inner">
      <a class="brand" href="{home_url}"><span class="ak">AK</span>Family</a>
      <form class="search" role="search" onsubmit="return false">
        <input id="q" type="search" autocomplete="off" placeholder="{search}" aria-label="{search}">
      </form>
      <nav>
        <a class="home" href="{home_url}">{home}</a>
        <a href="{repo_url}" target="_blank" rel="noopener">{repo}</a>
        <a class="lang" href="{other_href}" hreflang="{other_hreflang}">{other_lang}</a>
        <button type="button" class="theme" id="theme" aria-label="{theme}" title="{theme}">
          <svg class="sun" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>
          <svg class="moon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>
        </button>
      </nav>
    </div>
  </header>
  <div class="wrap layout">
    <aside class="side">
      <nav aria-label="{sections}">
{nav}
      </nav>
    </aside>
    <main class="content">
{body}
    </main>
  </div>
  <footer class="footer">
    <div class="wrap">
      <p>{updated} <a href="{repo_url}/edit/main/{src}" target="_blank" rel="noopener">{edit}</a></p>
      <p>© 2019–{year} AKFamily</p>
    </div>
  </footer>
  <a class="totop" id="totop" href="#top" aria-label="{top}" title="{top}" hidden>↑</a>
  <script>{js}</script>
</body>
</html>
"""

CSS = """
:root{--brand:#433dff;--brand-soft:#eef1ff;--text:#1f2328;--muted:#59636e;--line:#e3e6ea;
--bg:#fff;--bg-alt:#f6f7fb;--surface:#fff;--raised:#fff;--nav-bg:rgba(255,255,255,.94);
--on-brand:#fff;--ring:rgba(67,61,255,.14);--card-hover:#c5c9f7;
--card-shadow:rgba(67,61,255,.07);--pre:#f3f4f6;--shadow:rgba(0,0,0,.08);--sun:none;--moon:block;color-scheme:light;
font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC",
"Hiragino Sans GB","Microsoft YaHei",Arial,sans-serif;color:var(--text);line-height:1.75}
*{box-sizing:border-box}html{scroll-padding-top:76px}body{margin:0;background:var(--bg)}
[hidden]{display:none!important}
a{color:var(--brand);text-decoration:none}a:hover{text-decoration:underline}
.wrap{max-width:1180px;margin:0 auto;padding:0 24px}.ak{color:var(--brand)}
.nav{position:sticky;top:0;z-index:10;background:var(--nav-bg);
backdrop-filter:blur(8px);border-bottom:1px solid var(--line)}
.nav-inner{display:flex;align-items:center;gap:20px;min-height:60px}
.brand{font-size:22px;font-weight:700;color:var(--text)}.brand:hover{text-decoration:none}
.nav nav{display:flex;align-items:center;gap:22px;margin-left:auto;white-space:nowrap}
.nav nav a{color:var(--text);font-size:15px}
.theme{display:none;align-items:center;justify-content:center;width:34px;height:34px;padding:0;
color:var(--text);background:none;border:1px solid var(--line);border-radius:50%;cursor:pointer}
.js .theme{display:inline-flex}.theme:hover{color:var(--brand);border-color:var(--brand)}
.theme .sun{display:var(--sun)}.theme .moon{display:var(--moon)}
.search{display:none;flex:1;max-width:440px;margin:0 auto}.js .search{display:block}
.search input{width:100%;height:38px;padding:0 16px;font:inherit;font-size:15px;color:var(--text);
background:var(--bg-alt);border:1px solid var(--line);border-radius:999px;outline:none}
.search input:focus{background:var(--raised);border-color:var(--brand);
box-shadow:0 0 0 3px var(--ring)}
.layout{display:grid;grid-template-columns:200px minmax(0,1fr);gap:40px;align-items:start}
.side{position:sticky;top:61px;max-height:calc(100vh - 61px);overflow-y:auto;padding:28px 0}
.side nav{display:flex;flex-direction:column;gap:2px}
.side a{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:6px 12px;
border-radius:8px;color:var(--text);font-size:14.5px;line-height:1.5}
.side a:hover{background:var(--bg-alt);text-decoration:none}
.side a.cur{background:var(--brand-soft);color:var(--brand);font-weight:600}
.side a.none{opacity:.45}
.side .n{font-size:12.5px;color:var(--muted);font-variant-numeric:tabular-nums}
.side a.cur .n{color:var(--brand)}
.content{padding:28px 0 56px;min-width:0}
.hero h1{font-size:36px;line-height:1.3;margin:0 0 8px}.hero p{margin:8px 0}
.stats{color:var(--muted);font-size:14.5px}
.content h2{display:flex;align-items:center;gap:10px;font-size:24px;line-height:1.4;
margin:44px 0 16px;padding-bottom:8px;border-bottom:1px solid var(--line)}
.content h2 a{color:inherit}
.count{font-size:13px;font-weight:500;color:var(--muted);background:var(--bg-alt);
border-radius:999px;padding:0 10px;font-variant-numeric:tabular-nums}
.content blockquote{margin:16px 0;padding:12px 18px;background:var(--bg-alt);
border-left:4px solid var(--brand);border-radius:0 8px 8px 0;color:var(--muted)}
.content blockquote p{margin:0}
.content table{border-collapse:collapse;width:100%;font-size:15px}
.content th,.content td{border:1px solid var(--line);padding:8px 12px;text-align:left}
.content th{background:var(--bg-alt)}
.content ul{padding-left:22px}.content li > p{margin:0}
.filters{display:none;margin:28px 0 0;padding:14px 18px;background:var(--bg-alt);
border:1px solid var(--line);border-radius:12px}.js .filters{display:block}
.fgroup{display:flex;align-items:baseline;gap:12px;margin:4px 0}
.flabel{flex:none;min-width:3.2em;font-size:13.5px;color:var(--muted)}
.fchips,.tags{display:flex;flex-wrap:wrap;gap:6px}
.fstatus{display:flex;align-items:center;gap:14px;min-height:28px;margin-top:8px;padding-top:8px;
border-top:1px solid var(--line);font-size:13.5px;color:var(--muted)}
#clear{font:inherit;font-size:13.5px;color:var(--brand);background:none;border:0;padding:0;
cursor:pointer}#clear:hover{text-decoration:underline}
.chip,.tag{font:inherit;line-height:1.5;border-radius:999px;border:1px solid transparent;cursor:default}
.js .chip,.js .tag{cursor:pointer}
.chip{font-size:13.5px;padding:2px 13px;background:var(--raised);border-color:var(--line);color:var(--text)}
.js .chip:hover{border-color:var(--brand)}
.tag{font-size:12.5px;padding:0 10px;background:var(--brand-soft);color:var(--brand)}
.js .tag:hover{border-color:var(--brand)}
.chip[aria-pressed="true"],.tag.on{background:var(--brand);border-color:var(--brand);color:var(--on-brand)}
.chip:focus-visible,.tag:focus-visible,.totop:focus-visible,.theme:focus-visible{outline:2px solid var(--brand);
outline-offset:2px}
.empty{margin:28px 0;padding:28px 18px;text-align:center;color:var(--muted);
border:1px dashed var(--line);border-radius:12px}
.cards{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}
.card{display:flex;flex-direction:column;min-width:0;padding:14px 16px 12px;background:var(--surface);
border:1px solid var(--line);border-radius:12px;transition:border-color .15s,box-shadow .15s}
.card:hover{border-color:var(--card-hover);box-shadow:0 2px 12px var(--card-shadow)}
.card h3{margin:0 0 4px;font-size:16.5px;line-height:1.45;overflow-wrap:anywhere}
.card .desc{flex:1;color:var(--muted);font-size:14.5px;line-height:1.65;overflow-wrap:anywhere}
.card .desc p{margin:0}
.card .meta{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;
gap:6px 12px;margin-top:10px}
.host{min-width:0;font-size:12.5px;color:var(--muted);overflow:hidden;text-overflow:ellipsis;
white-space:nowrap}
code{font-family:Consolas,"SFMono-Regular",Menlo,monospace;font-size:13px;
background:var(--brand-soft);color:var(--brand);padding:1px 8px;border-radius:999px;margin-right:4px;
white-space:nowrap}
pre code{background:none;color:inherit;padding:0}
pre{background:var(--pre);padding:12px 16px;border-radius:8px;overflow-x:auto}
.footer{padding:28px 0;text-align:center;font-size:14px;color:var(--muted);
border-top:1px solid var(--line)}.footer p{margin:4px 0}.footer a{color:var(--muted)}
.totop{position:fixed;right:24px;bottom:24px;z-index:9;display:flex;align-items:center;
justify-content:center;width:42px;height:42px;font-size:18px;color:var(--text);background:var(--raised);
border:1px solid var(--line);border-radius:50%;box-shadow:0 2px 10px var(--shadow)}
.totop:hover{color:var(--brand);border-color:var(--brand);text-decoration:none}
@media (prefers-reduced-motion:no-preference){html{scroll-behavior:smooth}}
@media (max-width:960px){html{scroll-padding-top:120px}
.nav-inner{flex-wrap:wrap;gap:8px 16px;padding-top:10px;padding-bottom:10px}
.search{order:3;flex-basis:100%;max-width:none}.nav nav{gap:16px}
.layout{display:block}
.side{position:static;max-height:none;padding:14px 0 0;overflow:visible}
.side nav{flex-direction:row;gap:8px;overflow-x:auto;padding-bottom:6px;white-space:nowrap}
.side a{flex:none;padding:4px 13px;border:1px solid var(--line);border-radius:999px;font-size:14px}
.side a.cur{border-color:var(--brand)}
.content{padding:20px 0 44px}}
@media (max-width:720px){.wrap{padding:0 16px}.cards{grid-template-columns:1fr}
.hero h1{font-size:28px}.nav nav a{font-size:14px}.nav .home{display:none}
.content h2{font-size:21px;margin-top:36px}.filters{padding:12px 14px}
.totop{right:16px;bottom:16px}}
"""

# Dark palette. It applies when the visitor picks dark with the theme button,
# or when the system prefers dark and the visitor has not picked light.
DARK = (
    "--brand:#a09dff;--brand-soft:#262a52;--text:#e6e9ef;--muted:#9aa4b2;--line:#2b313c;"
    "--bg:#0e1116;--bg-alt:#161a22;--surface:#161a22;--raised:#222834;"
    "--nav-bg:rgba(14,17,22,.92);--on-brand:#11131a;--ring:rgba(160,157,255,.28);"
    "--card-hover:#4b5091;--card-shadow:rgba(0,0,0,.45);--pre:#161a22;--shadow:rgba(0,0,0,.5);"
    "--sun:block;--moon:none;color-scheme:dark"
)
CSS += (
    ":root[data-theme=dark]{" + DARK + "}\n"
    "@media (prefers-color-scheme:dark){:root:not([data-theme=light]){" + DARK + "}}\n"
)

JS = """
(function(){
var d=document,q=d.getElementById('q'),bar=d.getElementById('filters');
var totop=d.getElementById('totop'),tick=false;
var secs=[].slice.call(d.querySelectorAll('.sec'));
var navs={};
[].forEach.call(d.querySelectorAll('[data-nav]'),function(a){navs[a.getAttribute('data-nav')]=a});
function spy(){
  tick=false;var cur=null;
  secs.forEach(function(s){if(!s.hidden&&s.getBoundingClientRect().top<=140)cur=s.getAttribute('data-sec')});
  Object.keys(navs).forEach(function(k){navs[k].classList.toggle('cur',k===cur)});
  totop.hidden=window.pageYOffset<600;
}
window.addEventListener('scroll',function(){if(!tick){tick=true;requestAnimationFrame(spy)}},{passive:true});
spy();
var root=d.documentElement,tb=d.getElementById('theme');
var mq=window.matchMedia?window.matchMedia('(prefers-color-scheme: dark)'):null;
var metas=[].slice.call(d.querySelectorAll('meta[name="theme-color"]'));
var tones=metas.map(function(m){return m.getAttribute('content')});
function sysTheme(){return mq&&mq.matches?'dark':'light'}
function paint(){
  var t=root.getAttribute('data-theme');
  metas.forEach(function(m,i){m.setAttribute('content',t?tones[t==='dark'?1:0]:tones[i])});
}
if(tb){
  tb.addEventListener('click',function(){
    var next=(root.getAttribute('data-theme')||sysTheme())==='dark'?'light':'dark';
    try{
      if(next===sysTheme())localStorage.removeItem('akhub-theme');
      else localStorage.setItem('akhub-theme',next);
    }catch(e){}
    if(next===sysTheme())root.removeAttribute('data-theme');else root.setAttribute('data-theme',next);
    paint();
  });
  paint();
}
if(!q||!bar)return;
var status=d.getElementById('status'),clear=d.getElementById('clear'),empty=d.getElementById('empty');
var chips=[].slice.call(bar.querySelectorAll('.chip')),groups={},active={};
chips.forEach(function(c){groups[c.getAttribute('data-tag')]=c.getAttribute('data-group')});
var cards=[].slice.call(d.querySelectorAll('.card')).map(function(el){
  return {el:el,text:el.textContent.toLowerCase(),
    tags:(el.getAttribute('data-tags')||'').split('|').filter(Boolean),
    sec:el.closest('.sec').getAttribute('data-sec'),
    btns:[].slice.call(el.querySelectorAll('.tag'))};
});
var total=cards.length,showing=bar.getAttribute('data-showing');
function apply(jump){
  var terms=q.value.trim().toLowerCase().split(/\\s+/).filter(Boolean),by={},per={},shown=0;
  Object.keys(active).forEach(function(t){(by[groups[t]]=by[groups[t]]||[]).push(t)});
  var keys=Object.keys(by);
  cards.forEach(function(c){
    var ok=terms.every(function(t){return c.text.indexOf(t)>-1})&&
      keys.every(function(g){return by[g].some(function(t){return c.tags.indexOf(t)>-1})});
    c.el.hidden=!ok;
    if(ok){shown++;per[c.sec]=(per[c.sec]||0)+1}
    c.btns.forEach(function(b){b.classList.toggle('on',!!active[b.getAttribute('data-tag')])});
  });
  secs.forEach(function(s){
    if(!s.hasAttribute('data-entries'))return;
    var id=s.getAttribute('data-sec'),n=per[id]||0;
    s.hidden=n===0;
    [].forEach.call(d.querySelectorAll('[data-count]'),function(e){
      if(e.getAttribute('data-count')===id)e.textContent=n;
    });
    if(navs[id])navs[id].classList.toggle('none',n===0);
  });
  chips.forEach(function(c){c.setAttribute('aria-pressed',active[c.getAttribute('data-tag')]?'true':'false')});
  var on=terms.length>0||keys.length>0;
  status.textContent=showing.replace('{n}',shown).replace('{total}',total);
  clear.hidden=!on;empty.hidden=shown>0;
  var p=new URLSearchParams();
  if(q.value.trim())p.set('q',q.value.trim());
  if(Object.keys(active).length)p.set('tags',Object.keys(active).join(','));
  var qs=p.toString();
  try{history.replaceState(null,'',location.pathname+(qs?'?'+qs:'')+(on?'':location.hash))}catch(e){}
  if(jump){var top=bar.getBoundingClientRect().top;if(top<0)window.scrollTo(0,window.pageYOffset+top-90)}
  spy();
}
function toggle(tag){if(!groups[tag])return;if(active[tag])delete active[tag];else active[tag]=1}
chips.forEach(function(c){c.addEventListener('click',function(){toggle(c.getAttribute('data-tag'));apply(false)})});
d.addEventListener('click',function(e){
  var b=e.target.closest?e.target.closest('.tag'):null;
  if(b){toggle(b.getAttribute('data-tag'));apply(true)}
});
clear.addEventListener('click',function(){active={};q.value='';apply(false)});
q.addEventListener('input',function(){apply(true)});
d.addEventListener('keydown',function(e){
  if(e.key==='/'&&d.activeElement!==q&&!e.ctrlKey&&!e.metaKey&&!e.altKey){e.preventDefault();q.focus();q.select()}
  else if(e.key==='Escape'&&d.activeElement===q){q.value='';apply(true);q.blur()}
});
var init=new URLSearchParams(location.search);
if(init.get('q'))q.value=init.get('q');
(init.get('tags')||'').split(',').forEach(function(t){if(groups[t])active[t]=1});
apply(false);
})();
"""


def first_paragraph(text):
    for block in text.split("\n\n"):
        block = block.strip()
        if block and not block.startswith(("#", ">", "-", "|", "[", "简体中文")):
            return re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", block)
    return ""


def write_sitemap():
    """Write sitemap.xml and robots.txt, so search engines find both languages."""
    today = datetime.datetime.now(datetime.timezone.utc).date().isoformat()
    alternates = "".join(
        f'    <xhtml:link rel="alternate" hreflang="{page["lang"]}" href="{page["url"]}"/>\n'
        for page in PAGES
    )
    urls = "".join(
        f'  <url>\n    <loc>{page["url"]}</loc>\n    <lastmod>{today}</lastmod>\n{alternates}  </url>\n'
        for page in PAGES
    )
    (OUT / "sitemap.xml").write_text(
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" '
        'xmlns:xhtml="http://www.w3.org/1999/xhtml">\n'
        f'{urls}</urlset>\n',
        encoding="utf-8",
    )
    (OUT / "robots.txt").write_text(
        f"User-agent: *\nAllow: /\n\nSitemap: {SITE}sitemap.xml\n", encoding="utf-8"
    )


def main():
    year = datetime.date.today().year
    for page in PAGES:
        text = (ROOT / page["src"]).read_text(encoding="utf-8")
        title, nav, body = render_page(page, text)
        out = OUT / page["dst"]
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(
            TEMPLATE.format(
                lang=page["lang"],
                title=html.escape(title),
                description=html.escape(first_paragraph(text)),
                url=page["url"],
                site=SITE,
                css=CSS,
                js=JS,
                home=page["home"],
                home_url=HOME,
                repo=page["repo"],
                repo_url=REPO,
                other_lang=page["other_lang"],
                other_href=page["other_href"],
                other_hreflang="en" if page["lang"] != "en" else "zh-CN",
                search=esc(page["search"]),
                sections=esc(page["sections"]),
                top=esc(page["top"]),
                theme=esc(page["theme"]),
                nav=nav,
                body=body,
                updated=page["updated"],
                edit=page["edit"],
                src=page["src"],
                year=year,
            ),
            encoding="utf-8",
        )
        print(f"built {out.relative_to(ROOT)}")
    (OUT / ".nojekyll").write_text("", encoding="utf-8")
    write_sitemap()
    print("built sitemap.xml and robots.txt")
    return 0


if __name__ == "__main__":
    sys.exit(main())
