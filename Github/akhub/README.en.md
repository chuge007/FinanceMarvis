# AKHub

[简体中文](README.md) | English

AKHub is a curated list of financial and economic data tools, data sources, quant research frameworks, quant platforms and learning resources, maintained by [AKFamily](https://akfamily.xyz).

> Contributions are welcome! To suggest a data source or quant tool, please [open an issue](https://github.com/akfamily/akhub/issues/new/choose) in English or Chinese. See [Contributing](#contributing) for details.

## Contents

- [Tags](#tags)
- [Open Data Tools](#open-data-tools)
- [Financial Data SDK](#financial-data-sdk)
- [Public Data Sources](#public-data-sources)
- [Commercial Data Sources](#commercial-data-sources)
- [Quant Research Frameworks](#quant-research-frameworks)
- [Quant Platforms](#quant-platforms)
- [Learning Resources](#learning-resources)
- [Contributing](#contributing)
- [License](#license)

## Tags

| Tag | Meaning |
| --- | --- |
| `Free` | Free to use; some require registration |
| `Freemium` | Free tier available; more data or higher limits require payment |
| `Paid` | Requires purchase; a trial may be available |
| `API` | Offers programmatic access; not tagged for open data tools and SDKs, which are APIs by nature |
| `China` `Hong Kong` `US` `India` `Global` `Crypto` | Main market or data coverage |

## Open Data Tools

- [AKShare](https://github.com/akfamily/akshare)
  - An elegant and simple financial data interface library for Python, built for human beings.
  - `Free` `China` `Global`

- [Tushare](https://tushare.pro)
  - A Python interface for Chinese financial data. Registration required; data access is granted by points. The [legacy open-source library](https://github.com/waditu/tushare) is no longer maintained.
  - `Freemium` `China`

- [Yfinance](https://github.com/ranaroussi/yfinance)
  - A Python library for downloading market data from Yahoo! Finance.
  - `Free` `Global`

- [Pandas-datareader](https://pandas-datareader.readthedocs.io/)
  - A Python package providing remote data access for pandas.
  - `Free` `Global`

- [Wbdata](https://github.com/OliverSherouse/wbdata)
  - A Python library for accessing World Bank data.
  - `Free` `Global`

- [CCXT](https://github.com/ccxt/ccxt)
  - A unified library for market data and trading APIs of 100+ cryptocurrency exchanges, available in Python, JavaScript and more.
  - `Free` `Crypto`

- [Nasdaq Data Link](https://data.nasdaq.com/)
  - Nasdaq's financial and economic data platform, formerly known as Quandl.
  - `Freemium` `Global`

- [Financial Data](https://financialdata.net/)
  - Stock market and financial data API.
  - `Freemium` `Global`

- [ZVT](https://github.com/zvtvz/zvt)
  - Modular quant framework that records data for A-shares, US stocks and other markets from sources such as Eastmoney with incremental updates, and supports factor computation, stock selection and backtesting.
  - `Free` `China`

## Financial Data SDK

- [WindPy](https://www.wind.com.cn/)
  - The official Python SDK for Wind financial terminal data.
  - `Paid` `China`

- [JQData](https://github.com/JoinQuant/jqdatasdk)
  - The official SDK of the [JoinQuant](https://www.joinquant.com/help/api/help?name=JQData) database.
  - `Freemium` `China`

- [RQData](https://www.ricequant.com/doc/rqdata/python/)
  - An institution-oriented commercial Python financial data toolkit from [RiceQuant](https://www.ricequant.com/welcome/).
  - `Paid` `China`

- [TQSDK](https://github.com/shinnytech/tqsdk-python)
  - The SDK from Shinnytech, offering free futures tick and minute data.
  - `Freemium` `China`

- [Futu OpenAPI](https://github.com/FutunnOpen/py-futu-api)
  - The official Python SDK for Futu OpenAPI, providing quotes and trading for Hong Kong, US and other markets through the local OpenD gateway; a Futu account is required and some quotes need a paid subscription.
  - `Freemium` `Hong Kong` `US`

## Public Data Sources

- [National Bureau of Statistics of China](https://data.stats.gov.cn/)
  - Official macroeconomic statistics of China, including GDP, price indices, industry and population.
  - `Free` `China`

- [People's Bank of China Statistics](https://www.pbc.gov.cn/diaochatongjisi/116219/index.html)
  - Financial statistics such as money supply, aggregate financing and credit of financial institutions.
  - `Free` `China`

- [MOFCOM Data Center](https://data.mofcom.gov.cn/index.shtml)
  - Free data published by the Ministry of Commerce of China.
  - `Free` `China`

- [Shanghai Stock Exchange](https://www.sse.com.cn/)
  - Announcements, quotes and market statistics for companies listed in Shanghai.
  - `Free` `China`

- [Shenzhen Stock Exchange](https://www.szse.cn/)
  - Announcements, quotes and market statistics for companies listed in Shenzhen.
  - `Free` `China`

- [Shanghai Futures Exchange](https://www.shfe.com.cn/)
  - Quotes, trading parameters, warehouse receipts and market statistics for futures and options on base metals, precious metals, ferrous metals, energy and chemicals.
  - `Free` `China`

- [Shanghai International Energy Exchange](https://www.ine.cn/)
  - A subsidiary of the Shanghai Futures Exchange open to overseas traders, with quotes and statistics for crude oil, low-sulfur fuel oil, TSR 20 rubber, bonded copper and other products.
  - `Free` `China`

- [Dalian Commodity Exchange](http://www.dce.com.cn/)
  - Quotes, trading parameters, warehouse receipts and market statistics for futures and options on agricultural products, iron ore, coking coal, coke and chemicals.
  - `Free` `China`

- [Zhengzhou Commodity Exchange](https://www.czce.com.cn/)
  - Quotes, trading parameters, warehouse receipts and market statistics for futures and options on cotton, sugar, PTA, methanol, glass, soda ash and other products.
  - `Free` `China`

- [China Financial Futures Exchange](http://www.cffex.com.cn/)
  - Quotes, trading parameters, position rankings and market statistics for stock index futures, treasury bond futures and stock index options.
  - `Free` `China`

- [Guangzhou Futures Exchange](http://www.gfex.com.cn/)
  - Quotes, trading parameters and market statistics for futures and options on industrial silicon, lithium carbonate, polysilicon and other products.
  - `Free` `China`

- [CNINFO](https://www.cninfo.com.cn/)
  - The disclosure website designated by the China Securities Regulatory Commission, with announcements and periodic reports of companies listed in Shanghai, Shenzhen and Beijing.
  - `Free` `China`

- [Sina Finance](https://finance.sina.com.cn)
  - Chinese financial data covering stocks, futures, options, funds and more.
  - `Free` `China`

- [EastMoney](https://data.eastmoney.com/center)
  - Chinese financial data covering stocks, futures, options, funds and more, especially rich in user-generated text data.
  - `Free` `China`

- [China Index Academy](https://www.cih-index.com)
  - Chinese real estate price data.
  - `Freemium` `China`

- [HKEXnews](https://www.hkexnews.hk/)
  - The disclosure platform of Hong Kong Exchanges, with announcements and disclosure of interests of companies listed in Hong Kong.
  - `Free` `Hong Kong`

- [Webb Database](https://webb-database.com/)
  - Hong Kong listed companies, directors, shareholdings (CCASS) and governance data.
  - `Free` `Hong Kong`

- [Economic Research (FRED)](https://fred.stlouisfed.org)
  - Free economic data from the Federal Reserve Bank of St. Louis.
  - `Free` `API` `US`

- [SEC EDGAR](https://www.sec.gov/edgar/search/)
  - The electronic filing system of the U.S. Securities and Exchange Commission, with financial reports and filings of U.S. listed companies.
  - `Free` `API` `US`

- [Adanos](https://adanos.com/)
  - Market sentiment API for stocks using Reddit, X / FinTwit, financial news, and Polymarket signals.
  - `Freemium` `API` `US`

- [Equibles](https://equibles.com/)
  - US stock market data through an MCP server and REST API: SEC filings, financial statements, earnings call transcripts, insider and congressional trades, 13F holdings, short interest and options.
  - `Freemium` `API` `US`

- [Investing](https://www.investing.com)
  - Free real-time quotes, portfolios, streaming charts, financial news, live stock market data and more.
  - `Free` `Global`

- [World Bank Open Data](https://data.worldbank.org)
  - Free data from the World Bank.
  - `Free` `API` `Global`

- [IMF Data](https://data.imf.org/)
  - Macroeconomic, balance of payments and exchange rate data published by the International Monetary Fund.
  - `Free` `API` `Global`

- [OECD Data](https://data-explorer.oecd.org/)
  - Economic and social statistics of member countries published by the OECD.
  - `Free` `API` `Global`

- [FXMacroData](https://fxmacrodata.com/)
  - Macroeconomic releases, release calendars, FX spot rates and CFTC COT data covering 18 currencies.
  - `Paid` `API` `Global`

- [Crypto Fear & Greed Index (alternative.me)](https://alternative.me/crypto/fear-and-greed-index/)
  - A daily index of cryptocurrency market sentiment, with a free API and historical data; attribution is required.
  - `Free` `API` `Crypto`

## Commercial Data Sources

- [CSMAR](https://www.csmar.com/)
  - A research-grade economic and financial database for China, built by CSMAR Data Technology following the standards of CRSP, COMPUSTAT, TAQ and Thomson.
  - `Paid` `China`

- [CNRDS](https://www.cnrds.com)
  - Chinese Research Data Services Platform, an open, integrated data platform for research on China's economy, finance and business.
  - `Paid` `China`

- [RESSET](https://www.resset.com)
  - A data platform for model testing and investment research, with rich high-frequency data.
  - `Paid` `China`

- [萝卜投研 (Datayes Robo)](https://robo.datayes.com)
  - An investment research data platform developed by Datayes.
  - `Freemium` `China`

- [慧博投研资讯 (Hibor)](https://www.hibor.com.cn)
  - A collection of brokerage research reports, morning meeting notes and industry reports, useful for reading sell-side research; registration required, some content is paid, no API.
  - `Freemium` `China`

- [ChinaScope](https://www.chinascope.com.cn)
  - Industry-logic-based intelligent data products and solutions for financial institutions, enterprises and government agencies.
  - `Paid` `China`

- [CnOpenData](https://www.cnopendata.com)
  - Aggregates a wide range of internet data; a good place to look for niche or alternative data.
  - `Paid` `China`

- [预测者网 (Yucezhe)](https://www.yucezhe.com)
  - Low-, medium- and high-frequency data for stocks and cryptocurrencies, plus financial statement data.
  - `Paid` `China` `Crypto`

- [Tapetide](https://tapetide.com/mcp)
  - Indian stock market (NSE, BSE) data via an MCP server: financial statements, a ratio screener, technical indicators, FII/DII flows, index option chains (end-of-day snapshots), shareholding and filings.
  - `Freemium` `API` `India`

- [China Exchange Circulars](https://chinaexchangecirculars.com/)
  - Daily trading parameters (margins, price limits, fees, position limits) for futures listed on China's six futures exchanges, plus English summaries of exchange notices; web pages and RSS are free, alerts and data exports are paid.
  - `Freemium` `China`

## Quant Research Frameworks

- [AKQuant](https://github.com/akfamily/akquant)
  - High-performance backtesting and live trading framework with a Rust core and a Python API, featuring walk-forward training, TA-Lib-compatible indicators and a factor expression engine.
  - `Free` `China`

- [PyBroker](https://github.com/edtechre/pybroker)
  - Python backtesting framework focused on machine learning, with walk-forward analysis and a built-in AKShare data source.
  - `Free` `Global`

- [NautilusTrader](https://github.com/nautechsystems/nautilus_trader)
  - High-performance, event-driven trading platform with a Rust core; the same strategy code runs in backtesting and live trading.
  - `Free` `Global`

- [VeighNa](https://github.com/vnpy/vnpy)
  - Open-source Python framework for building quant trading platforms (formerly vn.py), with gateways to Chinese futures, securities and other brokers.
  - `Free` `China`

- [Backtrader](https://github.com/mementum/backtrader)
  - Long-standing event-driven backtesting framework with plenty of community material; largely unmaintained since 2024.
  - `Free` `Global`

- [Lean](https://github.com/QuantConnect/Lean)
  - QuantConnect's open-source algorithmic trading engine with a C# core; strategies can be written in Python or C#, with backtesting and live trading across multiple asset classes.
  - `Free` `Global`

- [Zipline Reloaded](https://github.com/stefan-jansen/zipline-reloaded)
  - Community-maintained version of Zipline, Quantopian's event-driven backtesting framework; the original is no longer maintained.
  - `Free` `Global`

- [RQAlpha](https://github.com/ricequant/rqalpha)
  - RiceQuant's open-source Python backtesting and trading framework for stocks and futures, extensible through Mods; non-commercial use only.
  - `Free` `China`

- [QUANTAXIS](https://github.com/yutiansut/QUANTAXIS)
  - Self-hosted quant solution covering data, backtesting, paper trading and live trading for stocks, futures and options.
  - `Free` `China`

- [Hikyuu](https://github.com/fasiondog/hikyuu)
  - Open-source quant research framework with a C++ core and a Python API, focused on strategy analysis and fast backtesting.
  - `Free` `China`

- [easytrader](https://github.com/shidenggui/easytrader)
  - Programmatic trading library for A-shares, supporting the Tonghuashun client, miniQMT and Xueqiu portfolios, and able to follow JoinQuant and RiceQuant paper trading.
  - `Free` `China`

- [QuantStats](https://github.com/ranaroussi/quantstats)
  - Portfolio performance and risk analytics library that generates HTML tear sheets.
  - `Free` `Global`

- [RustQuant](https://github.com/avhz/RustQuant)
  - Rust library for quantitative finance, covering option pricing, stochastic processes, yield curves and more.
  - `Free` `Global`

- [QuantLib](https://github.com/lballabio/QuantLib)
  - C++ library for quantitative finance, used for derivatives pricing, interest rate modeling and risk management, with bindings for Python and other languages.
  - `Free` `Global`

- [TA-Lib](https://github.com/TA-Lib/ta-lib-python)
  - Python wrapper for the TA-Lib technical analysis library, with 150+ indicators and candlestick pattern recognition.
  - `Free` `Global`

## Quant Platforms

- [聚宽 (JoinQuant)](https://www.joinquant.com/)
  - Online Python quant research platform with a research environment, strategy backtesting and paper trading.
  - `Freemium` `China`

- [RiceQuant](https://www.ricequant.com/welcome/quant)
  - RiceQuant's online Python platform for quant research and backtesting, covering stocks, futures and more.
  - `Paid` `China`

- [优矿 (Uqer)](https://uqer.datayes.com/)
  - Datayes' online Python quant platform, with a research environment, strategy backtesting and financial data.
  - `Freemium` `China`

- [掘金量化 (MyQuant)](https://www.myquant.cn/)
  - Quant platform built around a local terminal, supporting Python, C++, C# and other languages, with backtesting, simulation and live trading.
  - `Freemium` `China`

- [BigQuant](https://bigquant.com/)
  - AI-centered quant investment platform with visual modeling, machine learning strategy development and backtesting.
  - `Freemium` `China`

- [果仁网 (Guorn)](https://guorn.com/)
  - No-code quant stock selection and backtesting platform covering A-shares, Hong Kong stocks and ETFs.
  - `Freemium` `China`

- [FMZ Quant](https://www.fmz.com/)
  - Online quant trading platform (formerly BotVS) supporting JavaScript, Python and other languages, with connections to crypto exchanges and commodity futures.
  - `Freemium` `China` `Crypto`

## Learning Resources

- [QuantEcon](https://python.quantecon.org/)
  - Open-source lectures on economic and financial modeling with Python, led by Thomas J. Sargent and John Stachurski.
  - `Free` `Global`

- [Quantocracy](https://quantocracy.com/)
  - Aggregator of quantitative trading blog posts, updated daily with new research and strategy articles.
  - `Free` `Global`

- [arXiv Quantitative Finance (q-fin)](https://arxiv.org/archive/q-fin)
  - The quantitative finance preprint category on arXiv, covering asset pricing, portfolio management, risk management, market microstructure and more.
  - `Free` `Global`

- [Awesome Quant](https://github.com/wilsonfreitas/awesome-quant)
  - A curated English list of quantitative finance resources, with libraries, packages and learning material organized by programming language.
  - `Free` `Global`

## Contributing

Please use the [issue templates](https://github.com/akfamily/akhub/issues/new/choose) to suggest a data source or quant tool. See [CONTRIBUTING.md](CONTRIBUTING.md) for inclusion criteria and PR requirements.

## License

[MIT](LICENSE)
