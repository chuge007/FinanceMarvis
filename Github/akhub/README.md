# AKHub

简体中文 | [English](README.en.md)

AKHub 是 [AKFamily](https://akfamily.xyz) 维护的金融与经济数据工具、数据源、量化投研框架、量化平台和学习资源合集。

> 欢迎推荐你常用的数据源和量化工具！请在本仓库[提交 issue](https://github.com/akfamily/akhub/issues/new/choose)，中文或英文均可，详见[参与贡献](#参与贡献)。

## 目录

- [标签说明](#标签说明)
- [开源数据工具](#开源数据工具)
- [金融数据 SDK](#金融数据-sdk)
- [公开数据源](#公开数据源)
- [商业数据源](#商业数据源)
- [量化投研框架](#量化投研框架)
- [量化平台](#量化平台)
- [学习资源](#学习资源)
- [参与贡献](#参与贡献)
- [许可证](#许可证)

## 标签说明

| 标签 | 含义 |
| --- | --- |
| `免费` | 免费使用，部分需要注册 |
| `免费增值` | 有免费额度，更多数据或调用次数需要付费 |
| `付费` | 需要购买，可能提供试用 |
| `API` | 提供程序化访问接口；开源数据工具和金融数据 SDK 本身就是编程接口，不另标注 |
| `中国` `香港` `美国` `印度` `全球` `加密货币` | 主要覆盖的市场或数据范围 |

## 开源数据工具

- [AKShare](https://github.com/akfamily/akshare)
  - 优雅、简洁的 Python 财经数据接口库。
  - `免费` `中国` `全球`

- [Tushare](https://tushare.pro)
  - 中国金融数据 Python 接口，需注册，按积分开放数据权限；[旧版开源库](https://github.com/waditu/tushare)已不再维护。
  - `免费增值` `中国`

- [Yfinance](https://github.com/ranaroussi/yfinance)
  - 从雅虎财经（Yahoo! Finance）下载行情数据的 Python 库。
  - `免费` `全球`

- [Pandas-datareader](https://pandas-datareader.readthedocs.io/)
  - 为 pandas 提供远程数据访问的 Python 库。
  - `免费` `全球`

- [Wbdata](https://github.com/OliverSherouse/wbdata)
  - 访问世界银行数据的 Python 库。
  - `免费` `全球`

- [CCXT](https://github.com/ccxt/ccxt)
  - 统一接入上百家加密货币交易所行情和交易接口的开源库，支持 Python、JavaScript 等语言。
  - `免费` `加密货币`

- [Nasdaq Data Link](https://data.nasdaq.com/)
  - 纳斯达克旗下的金融与经济数据平台，前身为 Quandl。
  - `免费增值` `全球`

- [Financial Data](https://financialdata.net/)
  - 股票市场与财务数据 API。
  - `免费增值` `全球`

- [ZVT](https://github.com/zvtvz/zvt)
  - 模块化的量化框架，可从东方财富等来源抓取 A 股、美股等市场数据并增量入库，支持因子计算、选股和回测。
  - `免费` `中国`

## 金融数据 SDK

- [WindPy](https://www.wind.com.cn/)
  - 万得（Wind）金融终端数据的官方 Python SDK。
  - `付费` `中国`

- [JQData](https://github.com/JoinQuant/jqdatasdk)
  - [聚宽（JoinQuant）](https://www.joinquant.com/help/api/help?name=JQData)数据库的官方 SDK。
  - `免费增值` `中国`

- [RQData](https://www.ricequant.com/doc/rqdata/python/)
  - [米筐（RiceQuant）](https://www.ricequant.com/welcome/)面向机构的商业 Python 金融数据工具包。
  - `付费` `中国`

- [TQSDK](https://github.com/shinnytech/tqsdk-python)
  - 信易科技（shinnytech）的 SDK，可免费获取期货 Tick 和分钟数据。
  - `免费增值` `中国`

- [Futu OpenAPI](https://github.com/FutunnOpen/py-futu-api)
  - 富途 OpenAPI 的官方 Python SDK，通过本地网关 OpenD 获取港股、美股等市场的行情并进行交易；需要富途账户，部分行情需另购权限。
  - `免费增值` `香港` `美国`

## 公开数据源

- [国家统计局](https://data.stats.gov.cn/)
  - 中国官方宏观经济统计数据，包括 GDP、价格指数、工业、人口等。
  - `免费` `中国`

- [中国人民银行调查统计](https://www.pbc.gov.cn/diaochatongjisi/116219/index.html)
  - 货币供应量、社会融资规模、金融机构信贷收支等金融统计数据。
  - `免费` `中国`

- [商务数据中心](https://data.mofcom.gov.cn/index.shtml)
  - 免费获取中国商务部发布的数据。
  - `免费` `中国`

- [上海证券交易所](https://www.sse.com.cn/)
  - 沪市上市公司公告、行情和市场统计数据。
  - `免费` `中国`

- [深圳证券交易所](https://www.szse.cn/)
  - 深市上市公司公告、行情和市场统计数据。
  - `免费` `中国`

- [上海期货交易所](https://www.shfe.com.cn/)
  - 有色金属、贵金属、黑色金属、能源化工等期货和期权品种的行情、交易参数、仓单和市场统计数据。
  - `免费` `中国`

- [上海国际能源交易中心](https://www.ine.cn/)
  - 上期所旗下面向境外交易者开放的交易场所，提供原油、低硫燃料油、20 号胶、国际铜等品种的行情和统计数据。
  - `免费` `中国`

- [大连商品交易所](http://www.dce.com.cn/)
  - 农产品、铁矿石、焦煤、焦炭、化工等期货和期权品种的行情、交易参数、仓单和市场统计数据。
  - `免费` `中国`

- [郑州商品交易所](https://www.czce.com.cn/)
  - 棉花、白糖、PTA、甲醇、玻璃、纯碱等期货和期权品种的行情、交易参数、仓单和市场统计数据。
  - `免费` `中国`

- [中国金融期货交易所](http://www.cffex.com.cn/)
  - 股指期货、国债期货和股指期权的行情、交易参数、持仓排名和市场统计数据。
  - `免费` `中国`

- [广州期货交易所](http://www.gfex.com.cn/)
  - 工业硅、碳酸锂、多晶硅等期货和期权品种的行情、交易参数和市场统计数据。
  - `免费` `中国`

- [巨潮资讯](https://www.cninfo.com.cn/)
  - 中国证监会指定的信息披露网站，可查询沪深北上市公司公告和定期报告。
  - `免费` `中国`

- [新浪财经](https://finance.sina.com.cn)
  - 中国金融数据，涵盖股票、期货、期权、基金等。
  - `免费` `中国`

- [东方财富](https://data.eastmoney.com/center)
  - 中国金融数据，涵盖股票、期货、期权、基金等，用户生成的文本数据尤为丰富。
  - `免费` `中国`

- [中国指数研究院](https://www.cih-index.com)
  - 中国房地产价格数据。
  - `免费增值` `中国`

- [披露易（HKEXnews）](https://www.hkexnews.hk/)
  - 香港交易所的信息披露平台，可查询港股上市公司公告和权益披露。
  - `免费` `香港`

- [Webb Database](https://webb-database.com/)
  - 香港上市公司、董事、持股（CCASS）及公司治理数据。
  - `免费` `香港`

- [FRED（美联储经济数据）](https://fred.stlouisfed.org)
  - 免费获取美国圣路易斯联邦储备银行发布的经济数据。
  - `免费` `API` `美国`

- [SEC EDGAR](https://www.sec.gov/edgar/search/)
  - 美国证券交易委员会（SEC）的电子披露系统，可查询美国上市公司财报和公告。
  - `免费` `API` `美国`

- [Adanos](https://adanos.com/)
  - 股票市场情绪 API，信号来自 Reddit、X（FinTwit）、财经新闻和 Polymarket。
  - `免费增值` `API` `美国`

- [Equibles](https://equibles.com/)
  - 美股市场数据，可通过 MCP 服务器和 REST API 获取：SEC 文件、财务报表、财报电话会议记录、内部人和美国国会议员交易、13F 持仓、空头持仓和期权。
  - `免费增值` `API` `美国`

- [英为财情（Investing）](https://cn.investing.com)
  - 提供免费的实时行情、投资组合、走势图、财经新闻和股市数据等。
  - `免费` `全球`

- [世界银行公开数据](https://data.worldbank.org.cn)
  - 免费获取世界银行数据。
  - `免费` `API` `全球`

- [IMF 数据](https://data.imf.org/)
  - 国际货币基金组织（IMF）发布的各国宏观经济、国际收支和汇率数据。
  - `免费` `API` `全球`

- [OECD 数据](https://data-explorer.oecd.org/)
  - 经济合作与发展组织（OECD）发布的成员国经济、社会统计数据。
  - `免费` `API` `全球`

- [FXMacroData](https://fxmacrodata.com/)
  - 覆盖 18 种货币的宏观经济数据发布、发布日历、外汇即期汇率和 CFTC 持仓报告（COT）数据。
  - `付费` `API` `全球`

- [加密货币恐惧与贪婪指数（alternative.me）](https://alternative.me/crypto/fear-and-greed-index/)
  - 衡量加密货币市场情绪的每日指数，提供免费 API 和历史数据，使用时需注明数据来源。
  - `免费` `API` `加密货币`

## 商业数据源

- [CSMAR](https://www.csmar.com/)
  - 深圳希施玛数据科技有限公司从学术研究需求出发，借鉴 CRSP、COMPUSTAT、TAQ、THOMSON 等权威数据库的专业标准，结合中国实际国情开发的经济金融研究型精准数据库。
  - `付费` `中国`

- [CNRDS](https://www.cnrds.com)
  - 中国研究数据服务平台，是高质量、开放式、平台化的中国经济、金融与商学研究综合数据平台。
  - `付费` `中国`

- [RESSET](https://www.resset.com)
  - 为模型检验、投资研究等提供专业服务的数据平台，高频数据比较丰富。
  - `付费` `中国`

- [萝卜投研](https://robo.datayes.com)
  - 通联数据股份公司开发的投研数据平台。
  - `免费增值` `中国`

- [慧博投研资讯](https://www.hibor.com.cn)
  - 汇集券商研究报告、晨会纪要和行业报告，适合查阅研报；需注册，部分内容收费，不提供 API。
  - `免费增值` `中国`

- [ChinaScope](https://www.chinascope.com.cn)
  - 数库科技长期致力于在金融及产业领域提供基于产业逻辑的智能数据产品及系统服务，为金融机构、企业及政府部门提供数字化转型数据解决方案。
  - `付费` `中国`

- [CnOpenData](https://www.cnopendata.com)
  - 汇聚了大量互联网数据，适合查找小众或另类数据。
  - `付费` `中国`

- [预测者网](https://www.yucezhe.com)
  - 提供股票和加密货币的低、中、高频数据，以及财务数据。
  - `付费` `中国` `加密货币`

- [Tapetide](https://tapetide.com/mcp)
  - 印度股票市场（NSE、BSE）数据，可通过 MCP 服务器获取：财务报表、财务指标筛选、技术指标、FII/DII 资金流向、指数期权链（日终快照）、股东持股和公告。
  - `免费增值` `API` `印度`

- [China Exchange Circulars](https://chinaexchangecirculars.com/)
  - 国内六家期货交易所上市品种的每日交易参数（保证金、涨跌停板、手续费、持仓限额）和交易所公告的英文摘要；网页和 RSS 免费，变化提醒和数据导出需付费。
  - `免费增值` `中国`

## 量化投研框架

- [AKQuant](https://github.com/akfamily/akquant)
  - Rust 内核、Python 接口的高性能量化回测与实盘框架，内置滚动训练、TA-Lib 兼容指标和因子表达式引擎。
  - `免费` `中国`

- [PyBroker](https://github.com/edtechre/pybroker)
  - 侧重机器学习的 Python 回测框架，支持滚动前向分析（Walk-forward），内置 AKShare 数据源。
  - `免费` `全球`

- [NautilusTrader](https://github.com/nautechsystems/nautilus_trader)
  - Rust 内核的高性能事件驱动交易平台，回测与实盘使用同一套策略代码。
  - `免费` `全球`

- [VeighNa](https://github.com/vnpy/vnpy)
  - 基于 Python 的开源量化交易平台开发框架（原名 vn.py），对接国内期货、证券等多种交易接口。
  - `免费` `中国`

- [Backtrader](https://github.com/mementum/backtrader)
  - 老牌事件驱动回测框架，社区资料丰富；2024 年后已基本停止更新。
  - `免费` `全球`

- [Lean](https://github.com/QuantConnect/Lean)
  - QuantConnect 开源的算法交易引擎，C# 内核，可用 Python 和 C# 编写策略，支持多种资产的回测与实盘。
  - `免费` `全球`

- [Zipline Reloaded](https://github.com/stefan-jansen/zipline-reloaded)
  - Quantopian 事件驱动回测框架 Zipline 的社区维护版本；原版已停止维护。
  - `免费` `全球`

- [RQAlpha](https://github.com/ricequant/rqalpha)
  - 米筐（RiceQuant）开源的 Python 回测与交易框架，支持股票和期货，可通过 Mod 扩展；仅限非商业使用。
  - `免费` `中国`

- [QUANTAXIS](https://github.com/yutiansut/QUANTAXIS)
  - 可本地部署的量化解决方案，覆盖股票、期货、期权的数据、回测、模拟和实盘交易。
  - `免费` `中国`

- [Hikyuu](https://github.com/fasiondog/hikyuu)
  - C++ 内核、Python 接口的开源量化研究框架，侧重交易策略的分析与高速回测。
  - `免费` `中国`

- [easytrader](https://github.com/shidenggui/easytrader)
  - A 股程序化交易库，支持同花顺客户端、miniQMT 和雪球组合，可跟踪聚宽、米筐的模拟交易。
  - `免费` `中国`

- [QuantStats](https://github.com/ranaroussi/quantstats)
  - 投资组合绩效与风险分析库，可一键生成 HTML 分析报告。
  - `免费` `全球`

- [RustQuant](https://github.com/avhz/RustQuant)
  - Rust 量化金融库，涵盖期权定价、随机过程、利率曲线等。
  - `免费` `全球`

- [QuantLib](https://github.com/lballabio/QuantLib)
  - C++ 量化金融库，用于衍生品定价、利率建模和风险管理，提供 Python 等语言的接口。
  - `免费` `全球`

- [TA-Lib](https://github.com/TA-Lib/ta-lib-python)
  - 技术分析指标库 TA-Lib 的 Python 封装，提供 150 多种技术指标和 K 线形态识别。
  - `免费` `全球`

## 量化平台

- [聚宽（JoinQuant）](https://www.joinquant.com/)
  - 基于 Python 的在线量化研究平台，提供研究环境、策略回测和模拟交易。
  - `免费增值` `中国`

- [米筐量化平台](https://www.ricequant.com/welcome/quant)
  - 米筐（RiceQuant）的在线量化研究与回测平台，基于 Python，覆盖股票、期货等品种。
  - `付费` `中国`

- [优矿（Uqer）](https://uqer.datayes.com/)
  - 通联数据旗下的在线量化平台，基于 Python，提供研究环境、策略回测和金融数据。
  - `免费增值` `中国`

- [掘金量化](https://www.myquant.cn/)
  - 以本地终端为主的量化平台，支持 Python、C++、C# 等语言，提供回测、仿真和实盘交易。
  - `免费增值` `中国`

- [BigQuant](https://bigquant.com/)
  - 以人工智能为核心的量化投资平台，提供可视化建模、机器学习策略开发和回测。
  - `免费增值` `中国`

- [果仁网](https://guorn.com/)
  - 无需编程的量化选股与回测平台，覆盖 A 股、港股和 ETF。
  - `免费增值` `中国`

- [FMZ 发明者量化](https://www.fmz.com/)
  - 支持 JavaScript、Python 等语言的在线量化交易平台（原名 BotVS），可对接加密货币交易所和商品期货。
  - `免费增值` `中国` `加密货币`

## 学习资源

- [QuantEcon](https://python.quantecon.org/)
  - 用 Python 讲解经济学与金融建模的开源讲义，由 Thomas J. Sargent 和 John Stachurski 主持。
  - `免费` `全球`

- [Quantocracy](https://quantocracy.com/)
  - 量化交易博客文章聚合站，每日汇总新发布的研究与策略文章。
  - `免费` `全球`

- [arXiv 量化金融（q-fin）](https://arxiv.org/archive/q-fin)
  - arXiv 的量化金融预印本分类，涵盖资产定价、组合管理、风险管理、市场微观结构等方向的论文。
  - `免费` `全球`

- [Awesome Quant](https://github.com/wilsonfreitas/awesome-quant)
  - 英文量化金融资源清单，按编程语言整理了各类库、软件包和学习资料。
  - `免费` `全球`

## 参与贡献

推荐数据源或量化工具请使用 [issue 模板](https://github.com/akfamily/akhub/issues/new/choose)，收录标准和提交 PR 的要求见 [CONTRIBUTING.md](CONTRIBUTING.md)。

## 许可证

[MIT](LICENSE)
