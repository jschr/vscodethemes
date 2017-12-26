import { JobHandlers } from '../types/static'
import fetchThemes from './jobs/fetchThemes'
// import fetchRepository from './jobs/fetchRepository'
import createServices from './services/aws'

const jobName = process.env.JOB

const jobs: JobHandlers = {
  fetchThemes,
  // fetchRepository,
}

export default async function handler(event: any, context: AWSLambda.Context) {
  const services = createServices()

  try {
    const job = jobs[jobName]
    if (!job) {
      throw new Error(`Invalid job '${jobName}'.`)
    }

    const result = await job(services)
    context.succeed(result)
  } catch (err) {
    context.fail(err)
  }
}