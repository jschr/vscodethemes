import {
  ExtensionRuntime,
  FetchThemesPayloadRuntime,
} from '../../types/runtime'
import { Extension, ExtensionQueryResults, Services } from '../../types/static'
import { PermanentJobError, TransientJobError } from '../errors'

export const GITHUB_PROPERTY_NAME =
  'Microsoft.VisualStudio.Services.Links.GitHub'

export default async function run(services: Services): Promise<any> {
  const { fetchThemes, logger } = services

  const job = await fetchThemes.receive()
  if (!job) {
    logger.log('No more jobs to process.')
    return
  }

  logger.log('Proccessing fetchThemes job...')
  logger.log(`Receipt Handle: ${job.receiptHandle}`)
  logger.log(`Payload: ${JSON.stringify(job.payload)}`)

  try {
    if (!FetchThemesPayloadRuntime.guard(job.payload)) {
      throw new PermanentJobError('Invalid job payload.')
    }

    const { page } = job.payload
    const themes = await fetchMarketplaceThemes(services, page)
    if (themes.length === 0) {
      logger.log('No more pages to process.')
      // Only when we have finished processing all pages do we start
      // processing the repositories.
      // await fetchRepository.notify()
      await fetchThemes.succeed(job)
      return
    }
    // Queue a job to process the next page.
    await fetchThemes.create({ page: page + 1 })
    // Start processing the next page as soon as we queue the job.
    await fetchThemes.notify()

    const repositories = extractRepositories(services, themes)
    if (repositories.length === 0) {
      logger.log('No repositories to process for page.')
      return
    }

    logger.log(repositories)

    // Queue a job for each repository url.
    // await Promise.all(
    //   repositories.map(repository => fetchRepository.create({ repository })),
    // )

    await fetchThemes.succeed(job)

    logger.log(`
      Page: ${page}
      Themes found: ${themes.length}
      Repositories queued: ${repositories.length}
    `)
  } catch (err) {
    if (TransientJobError.is(err)) {
      logger.log(err.message)
      await fetchThemes.retry(job)
    } else if (PermanentJobError.is(err)) {
      logger.log(err.message)
      await fetchThemes.fail(job, err)
    } else {
      logger.log('Unexpected Error.')
      await fetchThemes.fail(job, err)
      // Rethrow error for global error handlers.
      throw err
    }
  }
}

/**
 * Fetch themes from the VSCode Marketplace for the provided page.
 */
async function fetchMarketplaceThemes(
  services: Services,
  page: number,
): Promise<Extension[]> {
  const { fetch } = services
  const url = `https://marketplace.visualstudio.com/_apis/public/gallery/extensionquery`
  const query = {
    filters: [
      {
        criteria: [
          // Not sure what this does and doesn't affect results.
          { filterType: 8, value: 'Microsoft.VisualStudio.Code' },
          // Not sure what this does and doesn't affect results.
          { filterType: 10, value: 'target:"Microsoft.VisualStudio.Code"' },
          // Not sure what this does but does filter out records.
          { filterType: 12, value: '5122' },
          { filterType: 5, value: 'Themes' },
        ],
        direction: 2, // Not sure what this does.
        pageSize: 100,
        pageNumber: page,
        sortBy: 4, // Sorts by most downloads.
        sortOrder: 0,
      },
    ],
    flags: 914, // Settings flags to 914 will return the github link.
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Accept: 'application/json;api-version=3.0-preview.1',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(query),
  })

  if (!response.ok) {
    throw new TransientJobError(`Bad response: ${response.statusText}`)
  }

  const data: ExtensionQueryResults = await response.json()
  try {
    return data.results[0].extensions
  } catch (err) {
    // TODO: Add test fpr this.
    throw new TransientJobError(
      `Invalid response data: ${JSON.stringify(data)}`,
    )
  }
}

/**
 * Extracts repository urls from a list of themes.
 */
function extractRepositories(
  services: Services,
  themes: Extension[],
): string[] {
  const { logger } = services
  const repos: string[] = []

  themes.forEach(theme => {
    if (ExtensionRuntime.guard(theme)) {
      // Sort by the lastUpdatedAt (ISO string) to get the latest version.
      const latestVersion = theme.versions.sort((a, b) =>
        b.lastUpdated.localeCompare(a.lastUpdated),
      )[0]
      // Find the property the contains theme's repository url.
      const repoUrlProp = latestVersion.properties.find(
        prop => prop.key === GITHUB_PROPERTY_NAME,
      )

      if (repoUrlProp) {
        repos.push(repoUrlProp.value)
      } else {
        // Skip themes without github url.
        logger.log(
          `Missing property '${GITHUB_PROPERTY_NAME}': \n${JSON.stringify(
            theme,
          )}\n`,
        )
      }
    } else {
      // Skip themes with unexpected structure.
      logger.log(`Invalid theme: ${JSON.stringify(theme)}`)
    }
  })

  return repos
}