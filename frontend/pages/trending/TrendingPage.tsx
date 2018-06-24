import { LanguageOptions, SortByOptions, Theme } from '@vscodethemes/types'
import { Context } from 'next'
import Head from 'next/head'
import * as React from 'react'
import * as algolia from '../../clients/algolia'
import { App, Heading, Pagination, ThemeGrid } from '../../components'
import { TrendingLink } from './'
import styles from './TrendingPage.styles'

interface TrendingPageProps {
  themes: Theme[]
  page: number
  totalPages: number
  language: LanguageOptions
}

export default class TrendingPage extends React.Component<
  TrendingPageProps,
  {}
> {
  static perPage = 24

  static async getInitialProps(ctx: Context): Promise<TrendingPageProps> {
    const language = LanguageOptions.javascript
    const page = parseInt(ctx.query.page, 10) || 1

    const trendingThemes = await algolia.search({
      dark: true,
      light: true,
      sortBy: SortByOptions.trending,
      lang: language,
      perPage: TrendingPage.perPage,
      page: page - 1,
      distinct: 1,
    })

    return {
      themes: trendingThemes.hits,
      totalPages: trendingThemes.nbPages,
      page,
      language,
    }
  }

  handleLanguage = async (language: LanguageOptions) => {
    console.log('implement this') // tslint:disable-line
  }

  render() {
    const { themes, language, page, totalPages } = this.props

    return (
      <App>
        <Head>
          <title>Trending themes</title>
        </Head>
        <div className={styles.wrapper}>
          <ThemeGrid
            themes={themes}
            language={language}
            onLanguage={this.handleLanguage}
          />
          <Pagination page={page} totalPages={totalPages} Link={TrendingLink} />
        </div>
      </App>
    )
  }
}