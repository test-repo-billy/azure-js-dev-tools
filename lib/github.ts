/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for
 * license information.
 */

import Octokit from "@octokit/rest";
import * as fs from "fs";
import { contains, first, map, removeFirst, where } from "./arrays";
import { URLBuilder } from "./url";
import { clone } from "./common";

export interface GitHubErrorOptions {
  /**
   * The HTTP status code that was returned from the GitHub request.
   */
  statusCode?: number;
}

/**
 * An error that is thrown from a GitHub request.
 */
export class GitHubError extends Error {
  /**
   * The HTTP status code that was returned in the GitHub response.
   */
  public readonly statusCode?: number;
  /**
   * Create a new GitHubError.
   * @param message The reason that this error was thrown.
   * @param options The optional values that can be added to this GitHubError.
   */
  constructor(message: string, options: GitHubErrorOptions = {}) {
    super(message);

    this.statusCode = options.statusCode;
  }
}

/**
 * The name and optional organization that the repository belongs to.
 */
export interface GitHubRepository {
  /**
   * The name of the repository.
   */
  name: string;
  /**
   * The organization that owns the repository.
   */
  organization: string;
}

/**
 * A comment in a GitHub repository.
 */
export interface GitHubComment {
  id: number;
  node_id: string;
  url: string;
  /**
   * The URL to the html version of this comment.
   */
  html_url: string;
  /**
   * The body/text of this comment.
   */
  body: string;
  /**
   * The user that made this comment.
   */
  user: GitHubUser;
  /**
   * The timestamp for when this comment was created.
   */
  created_at: string;
  /**
   * The timestamp for the last time that this comment was updated.
   */
  updated_at: string;
  /**
   * The version of this comment.
   */
  etag: string;
}

/**
 * Get a GitHubRepository object from the provided string or GitHubRepository object.
 * @param repository The repository name or object.
 */
export function getGitHubRepository(repository: string | GitHubRepository): GitHubRepository {
  let result: GitHubRepository;
  if (!repository) {
    result = {
      name: repository,
      organization: ""
    };
  } else if (typeof repository === "string") {
    let slashIndex: number = repository.indexOf("/");
    if (slashIndex === -1) {
      slashIndex = repository.indexOf("\\");
    }
    result = {
      name: repository.substr(slashIndex + 1),
      organization: slashIndex === -1 ? "" : repository.substr(0, slashIndex)
    };
  } else {
    result = repository;
  }
  return result;
}

/**
 * Get the full name of the provided repository.
 * @param repository The repository to get the full name of.
 */
export function getRepositoryFullName(repository: string | GitHubRepository): string {
  let result: string;
  if (!repository) {
    result = "";
  } else if (typeof repository === "string") {
    result = repository;
  } else if (!repository.organization) {
    result = repository.name;
  } else {
    result = `${repository.organization}/${repository.name}`;
  }
  return result;
}

/**
 * The type of the body that GitHub sends for a pull_request webhook request.
 */
export interface GitHubPullRequestWebhookBody {
  /**
   * The action that the Webhook request is being sent as a result of.
   */
  action: "assigned" | "unassigned" | "review_requested" | "review_request_removed" | "labeled" | "unlabeled" | "opened" | "edited" | "closed" | "reopened";
  /**
   * The pull request number.
   */
  number: number;
  /**
   * The pull request that was changed.
   */
  pull_request: GitHubPullRequest;
}

export interface GitHubLabel {
  id: number;
  node_id: string;
  url: string;
  name: string;
  color: string;
  default: boolean;
}

export type GitHubMilestoneState = "open" | "closed";

export interface GitHubMilestone {
  title: string;
  due_on: string;
  number: number;
  open_issues: number;
  closed_issues: number;
  state: GitHubMilestoneState;
}

export interface GitHubSprintLabel {
  sprint: number;
  unplannedColor?: string;
  plannedColor?: string;
  startedColor?: string;
}

export interface GitHubSprintMilestone {
  milestoneNumber?: number;
  sprint: number;
  endDate: string;
  openIssueCount: number;
  open: boolean;
}

export type GitHubPullRequestState = "open" | "closed";

export interface GitHubPullRequest {
  base: GitHubPullRequestCommit;
  head: GitHubPullRequestCommit;
  merge_commit_sha?: string;
  id: number;
  labels: GitHubLabel[];
  number: number;
  state: GitHubPullRequestState;
  title: string;
  url: string;
  html_url: string;
  diff_url: string;
  milestone?: GitHubMilestone;
  assignees?: GitHubUser[];
  /**
   * The description for the pull request.
   */
  body?: string;
}

export interface GitHubUser {
  id: number;
  login: string;
  name?: string;
  url: string;
  node_id: string;
  site_admin: boolean;
  etag?: string;
}

export interface GitHubPullRequestCommit {
  label: string;
  ref: string;
  sha: string;
}

/**
 * Get the label in the provided GitHubPullRequest that has the provided name. If no label is found,
 * then undefined will be returned.
 * @param githubPullRequest The pull request to look for the label in.
 * @param labelName The name of the label to look for.
 */
export function gitHubPullRequestGetLabel(githubPullRequest: GitHubPullRequest, labelName: string): GitHubLabel | undefined {
  return first(githubPullRequest.labels, (label: GitHubLabel) => label.name === labelName);
}

export function gitHubPullRequestGetLabels(githubPullRequest: GitHubPullRequest, labelNames: string | string[]): GitHubLabel[] {
  const labelNamesArray: string[] = (typeof labelNames === "string" ? [labelNames] : labelNames);
  return where(githubPullRequest.labels, (label: GitHubLabel) => contains(labelNamesArray, label.name));
}

export function gitHubPullRequestGetAssignee(githubPullRequest: GitHubPullRequest, assignee: GitHubUser | string | number): GitHubUser | undefined {
  return first(githubPullRequest.assignees, (existingAssignee: GitHubUser) => {
    let isMatch: boolean;
    if (!assignee) {
      isMatch = false;
    } else if (typeof assignee === "number") {
      isMatch = (existingAssignee.id === assignee);
    } else if (typeof assignee === "string") {
      isMatch = (existingAssignee.login === assignee || existingAssignee.name === assignee);
    } else {
      isMatch = (existingAssignee.id === assignee.id);
    }
    return isMatch;
  });
}

function getPullRequestNumber(pullRequest: number | GitHubPullRequest): number {
  return typeof pullRequest === "number" ? pullRequest : pullRequest.number;
}

function getCommentId(comment: number | GitHubComment): number {
  return typeof comment === "number" ? comment : comment.id;
}

/**
 * Optional parameters that can be provided to the GitHub.getMilestones() function to restrict the
 * returned milestones.
 */
export interface GitHubGetMilestonesOptions {
  /**
   * Filter the results to the milestones that are either open (true) or closed (false). If this
   * value is undefined, then all milestones will be returned.
   */
  open?: boolean;
}

export interface GitHubCreateMilestoneOptions {
  endDate?: string;
}

/**
 * Optional parameters that can be provided to the GitHub.getPullRequests() function to restrict the
 * returned pull requests.
 */
export interface GitHubGetPullRequestsOptions {
  /**
   * Filter the results to the pull requests that are either open (true) or closed (false). If this
   * value is undefined, then all pull requests will be returned.
   */
  open?: boolean;
}

/**
 * Optional parameters that can be provided to the GitHub.createPullRequest function.
 */
export interface GitHubCreatePullRequestOptions {
  /**
   * The description that will appear in the created pull request.
   */
  description?: string;
}

/**
 * A commit that exists in a GitHub repository.
 */
export interface GitHubCommit {
  /**
   * The unique identifier for this commit.
   */
  sha: string;
  /**
   * The data of the GitHub commit.
   */
  commit: GitHubCommitData;
}

/**
 * The data of a GitHub commit.
 */
export interface GitHubCommitData {
  /**
   * The message of the commit.
   */
  message: string;
}

/**
 * A reference to a branch in a forked repository.
 */
export interface ForkedRepositoryBranch {
  /**
   * The username of the user that created the forked repository.
   */
  username: string;
  /**
   * The name of the branch in the fork.
   */
  branchName: string;
}

/**
 * Parse a ForkedRepositoryBranch reference from the provided value.
 * @param forkedRepositoryBranch The string or ForkedRepositoryBranch to parse.
 */
export function getForkedRepositoryBranch(forkedRepositoryBranch: string | ForkedRepositoryBranch): ForkedRepositoryBranch {
  let result: ForkedRepositoryBranch;
  if (typeof forkedRepositoryBranch === "string") {
    const colonIndex: number = forkedRepositoryBranch.indexOf(":");
    const username: string = forkedRepositoryBranch.substring(0, colonIndex);
    const branchName: string = forkedRepositoryBranch.substring(colonIndex + 1);
    result = {
      username,
      branchName
    };
  } else {
    result = forkedRepositoryBranch;
  }
  return result;
}

export function getForkedRepositoryBranchFullName(forkedRepositoryBranch: string | ForkedRepositoryBranch): string {
  let result: string;
  if (!forkedRepositoryBranch || typeof forkedRepositoryBranch === "string") {
    result = forkedRepositoryBranch;
  } else if (!forkedRepositoryBranch.username) {
    result = forkedRepositoryBranch.branchName;
  } else {
    result = `${forkedRepositoryBranch.username}:${forkedRepositoryBranch.branchName}`;
  }
  return result;
}

/**
 * A generic reference from a GitHub repository. This can be either a branch, tag, note, or stash.
 */
export interface GitHubReference {
  /**
   * This reference's full name.
   */
  readonly ref: string;
  readonly node_id: string;
  /**
   * The GitHub URL for this reference.
   */
  readonly url: string;
  readonly object: {
    /**
     * The type of Git object that this reference points to.
     */
    readonly type: string;
    /**
     * The SHA that this reference points to.
     */
    readonly sha: string;
    /**
     * The URL of the Git object that this reference points to.
     */
    readonly url: string;
  };
}

/**
 * A branch reference from a GitHub repository.
 */
export interface GitHubBranch extends GitHubReference {
  /**
   * The simplified name of the branch.
   */
  readonly name: string;
}

export interface GitHub {
  /**
   * Get the user that is currently authenticated.
   * @returns The user that is currently authenticated.
   */
  getCurrentUser(): Promise<GitHubUser>;

  /**
   * Get all of the labels in the provided repository.
   */
  getLabels(repository: string | GitHubRepository): Promise<GitHubLabel[]>;

  /**
   * Get all of the labels that contain "-Sprint-" in the provided repository.
   * @param repository The repository to look in.
   */
  getSprintLabels(repository: string | GitHubRepository): Promise<GitHubSprintLabel[]>;

  /**
   * Create a label with the provided labelName and color in the provided repository.
   * @param repositoryName The name of the repository where the label will be created.
   * @param labelName The name of the created label.
   * @param color The color of the created label.
   */
  createLabel(repository: string | GitHubRepository, labelName: string, color: string): Promise<GitHubLabel>;

  /**
   * Delete the provided label from the provided repository.
   * @param repository The repository to delete the label from.
   * @param label The label name, id, or details to delete.
   */
  deleteLabel(repository: string | GitHubRepository, label: string | number | GitHubLabel): Promise<unknown>;

  /**
   * Update the color of the label with the provided name in the provided repository.
   * @param repository The repository that contains the label to update.
   * @param labelName The name of the label to update.
   * @param newColor The color to update the label to.
   */
  updateLabelColor(repository: string | GitHubRepository, labelName: string, newColor: string): Promise<unknown>;

  /**
   * Get the milestone in the provided repository with either the provided milestone number or name.
   */
  getMilestone(repository: string | GitHubRepository, milestone: number | string): Promise<GitHubMilestone>;

  /**
   * Get all of the milestones that exist in the provided repository.
   * @param repository The repository to get all of the milestones of.
   * @returns All of the milestones that exist in the provided repository.
   */
  getMilestones(repository: string | GitHubRepository, options?: GitHubGetMilestonesOptions): Promise<GitHubMilestone[]>;

  /**
   * Get all of the sprint milestones (milestones that begin with "Sprint-") in the provided
   * repository.
   * @param repository The repository.
   * @returns All of the sprint milestones in the provided repository.
   */
  getSprintMilestones(repository: string | GitHubRepository, options?: GitHubGetMilestonesOptions): Promise<GitHubSprintMilestone[]>;

  /**
   * Create a new milestone in the provided repository.
   * @param repository The repository to create a new milestone in.
   * @param milestoneName The name of the new milestone.
   * @param options The optional properties to set on the created milestone.
   */
  createMilestone(repositoryName: string | GitHubRepository, milestoneName: string, options?: GitHubCreateMilestoneOptions): Promise<GitHubMilestone>;

  /**
   * Create a new sprint milestone in the provided repository.
   * @param repository The repository to create the new sprint milestone in.
   * @param sprintNumber The number of the sprint that the milestone will be associated with.
   * @param sprintEndDate The last day of the sprint.
   */
  createSprintMilestone(repository: string | GitHubRepository, sprintNumber: number, sprintEndDate: string): Promise<GitHubSprintMilestone | undefined>;

  /**
   * Update the end date of an existing milestone in the provided repository.
   * @param repository The repository that contains the milestone to update.
   * @param milestoneNumber The number id of the milestone to update.
   * @param newSprintEndDate The new end date to update the existing milestone to.
   */
  updateMilestoneEndDate(repository: string | GitHubRepository, milestoneNumber: number, newSprintEndDate: string): Promise<GitHubMilestone>;

  updateSprintMilestoneEndDate(repository: string | GitHubRepository, sprintMilestone: GitHubSprintMilestone, newSprintEndDate: string): Promise<GitHubSprintMilestone>;

  closeMilestone(repository: string | GitHubRepository, milestoneNumber: number): Promise<unknown>;

  closeSprintMilestone(repository: string | GitHubRepository, sprintMilestone: GitHubSprintMilestone): Promise<unknown>;

  /**
   * Get the pull request from the provided repository with the provided number.
   * @param repository The repository to get the pull request from.
   */
  getPullRequest(repository: string | GitHubRepository, pullRequestNumber: number): Promise<GitHubPullRequest>;

  /**
   * Get the pull requests in the provided respository.
   * @param repository The name of the repository.
   */
  getPullRequests(repository: string | GitHubRepository, options?: GitHubGetPullRequestsOptions): Promise<GitHubPullRequest[]>;

  /**
   * Create a new pull request in the provided repository.
   * @param repository The repository to create the pull request in.
   * @param baseBranch The base branch that the pull request will merge into.
   * @param headBranch The head branch that the pull request will merge from.
   * @param title The title of the pull request.
   * @param options The optional parameters for creating a pull request.
   */
  createPullRequest(repository: string | GitHubRepository, baseBranch: string, headBranch: string | ForkedRepositoryBranch, title: string, options?: GitHubCreatePullRequestOptions): Promise<GitHubPullRequest>;

  /**
   * Close the provided pull request without merging it.
   * @param repository The repository that the pull request exists in.
   * @param pullRequest The pull request number or the pull request object to close.
   */
  closePullRequest(repository: string | GitHubRepository, pullRequest: number | GitHubPullRequest): Promise<unknown>;

  /**
   * Merge and close the provided pull request.
   * @param repository The repository that the pull request exists in.
   * @param pullRequest The pull request number or the pull request object to merge.
   */
  mergePullRequest(repository: string | GitHubRepository, pullRequest: number | GitHubPullRequest): Promise<unknown>;

  addPullRequestAssignees(repository: string | GitHubRepository, githubPullRequest: GitHubPullRequest | number, assignees: string | GitHubUser | (string | GitHubUser)[]): Promise<unknown>;

  /**
   * Add the provided labels to the provided GitHubPullRequest.
   * @param repository The repository where the pull request exists.
   * @param githubPullRequest The GitHubPullRequest that the labels will be added to.
   * @param labelNamesToAdd The name of the label or labels to add to the pull request.
   */
  addPullRequestLabels(repository: string | GitHubRepository, githubPullRequest: GitHubPullRequest | number, labelNames: string | string[]): Promise<string[]>;

  /**
   * Remove the provided labels from the provided pull request.
   * @param repository The repository where the pull request exists.
   * @param githubPullRequest The pull request that the labels will be removed from.
   * @param labelNames The names of the labels to remove from the pull request.
   * @returns The names of the labels that were removed.
   */
  removePullRequestLabels(repository: string | GitHubRepository, githubPullRequest: GitHubPullRequest | number, labelNames: string | string[]): Promise<string[]>;

  /**
   * Set the milestone that the provided pull request is assigned to.
   * @param repository The repository where the pull request exists.
   * @param githubPullRequest The pull request to assign.
   * @param milestone The milestone to assign to the pull request.
   */
  setPullRequestMilestone(repository: string | GitHubRepository, githubPullRequest: GitHubPullRequest | number, milestone: number | string | GitHubMilestone): Promise<unknown>;

  /**
   * Get the comments that have been made on the provided GitHubPullRequest.
   * @param repository The repository where the pull request exists.
   * @param githubPullRequest The GitHubPullRequest to get the comments of.
   */
  getPullRequestComments(repository: string | GitHubRepository, githubPullRequest: GitHubPullRequest | number): Promise<GitHubComment[]>;

  /**
   * Get the latest properties of the provided comment.
   * @param repository The repository where the pull request exists.
   * @param githubPullRequest The GitHubPullRequest to get the comment from.
   * @param comment The comment to get the latest properties of.
   */
  getPullRequestComment(repository: string | GitHubRepository, githubPullRequest: GitHubPullRequest | number, comment: GitHubComment | number): Promise<GitHubComment>;

  /**
   * Create a new comment on the provided GitHubPullRequest.
   * @param repository The repository where the pull request exists.
   * @param githubPullRequest The GitHubPullReuqest to create the new comment on.
   * @param commentBody The text of the comment to make.
   */
  createPullRequestComment(repository: string | GitHubRepository, githubPullRequest: GitHubPullRequest | number, commentBody: string): Promise<GitHubComment>;

  /**
   * Update an existing comment on the provided GitHubPullRequest.
   * @param repository The repository where the pull request exists.
   * @param githubPullRequest The GitHubPullRequest to update an existing comment on.
   * @param comment The updated comment.
   * @param commentBody The new body for the comment.
   * @param etag The optional previous version of the comment. If this does not match with the etag
   * in GitHub, then the request will fail.
   */
  updatePullRequestComment(repository: string | GitHubRepository, githubPullRequest: GitHubPullRequest | number, comment: GitHubComment | number, commentBody: string, etag?: string): Promise<GitHubComment>;

  /**
   * Delete an existing comment from the provided GitHubPullRequest.
   * @param repository The repository where the pull request exists.
   * @param githubPullRequest The GitHubPUllRequest to delete an existing comment from.
   * @param comment The comment to delete.
   */
  deletePullRequestComment(repository: string | GitHubRepository, githubPullRequest: GitHubPullRequest | number, comment: GitHubComment | number): Promise<unknown>;

  /**
   * Get the details of the commit with the provided unique identifier or undefined if no commit
   * existed with the provided identifier.
   * @param repository The repository that the commit exists in.
   * @param commit A unique identifier for the commit.
   */
  getCommit(repository: string | GitHubRepository, commit: string): Promise<GitHubCommit | undefined>;

  /**
   * Get all of the references (branches, tags, notes, stashes, etc.) in the provided repository.
   * @param repository The repository to get all of the references for.
   * @returns All of the references (branches, tags, notes, stashes, etc.) in the provided
   * repository.
   */
  getAllReferences(repository: string | GitHubRepository): Promise<GitHubReference[]>;

  /**
   * Get all of the branches in the provided repository.
   * @param repository The repository to get all of the branches for.
   * @returns All of the branches in the provided repository.
   */
  getAllBranches(repository: string | GitHubRepository): Promise<GitHubBranch[]>;

  /**
   * Get more information about the provided branch in the provided repository.
   * @param repository The repository to get the branch from.
   * @param branchName The name of the branch to get.
   */
  getBranch(repository: string | GitHubRepository, branchName: string): Promise<GitHubBranch>;

  /**
   * Delete the branch with the provided name in the provided repository.
   * @param repository The repository to delete the branch from.
   * @param branchName The name of the branch to delete.
   */
  deleteBranch(repository: string | GitHubRepository, branchName: string): Promise<unknown>;

  /**
   * Create a branch with the provided name as the provided sha in the provided repository.
   * @param repository The repository to create the branch in.
   * @param branchName The name of the branch to create.
   * @param branchSha The SHA/commit ID that the branch will be created at.
   */
  createBranch(repository: string | GitHubRepository, branchName: string, branchSha: string): Promise<GitHubBranch>;
}

export interface FakeGitHubPullRequest extends GitHubPullRequest {
  comments: GitHubComment[];
}

export class FakeGitHubRepository {
  public readonly labels: GitHubLabel[] = [];
  public readonly milestones: GitHubMilestone[] = [];
  public readonly pullRequests: FakeGitHubPullRequest[] = [];
  public readonly commits: GitHubCommit[] = [];
  public readonly branches: GitHubBranch[] = [];
  public readonly forks: FakeGitHubRepository[] = [];

  constructor(public readonly name: string, public readonly forkOf?: FakeGitHubRepository) {
  }

  /**
   * Get the fork of this repository that was created by the provided username/organization.
   * @param usernameOrOrganization The name of the user or organization that created a fork of this
   * repository.
   */
  public getFork(usernameOrOrganization: string): FakeGitHubRepository | undefined {
    return first(this.forks, (fork: FakeGitHubRepository) => getGitHubRepository(fork.name).organization === usernameOrOrganization);
  }
}

export class FakeGitHub implements GitHub {
  private readonly users: GitHubUser[] = [];
  private currentUser: GitHubUser | undefined;
  private readonly repositories: FakeGitHubRepository[] = [];

  public getRepository(repository: string | GitHubRepository): Promise<FakeGitHubRepository> {
    const repositoryFullName: string = getRepositoryFullName(repository);
    const fakeRepository: FakeGitHubRepository | undefined = first(this.repositories, (fakeRepository: FakeGitHubRepository) => fakeRepository.name === repositoryFullName);
    let result: Promise<FakeGitHubRepository>;
    if (fakeRepository) {
      result = Promise.resolve(fakeRepository);
    } else {
      result = Promise.reject(new GitHubError(`No fake repository exists with the name "${repositoryFullName}".`));
    }
    return result;
  }

  private async createRepositoryInner(repository: string | GitHubRepository, forkOf?: string | GitHubRepository): Promise<FakeGitHubRepository> {
    const repositoryFullName: string = getRepositoryFullName(repository);
    let fakeRepository: FakeGitHubRepository | undefined = first(this.repositories, (fakeRepository: FakeGitHubRepository) => fakeRepository.name === repositoryFullName);
    let result: Promise<FakeGitHubRepository>;
    if (fakeRepository) {
      result = Promise.reject(new GitHubError(`A fake repository with the name "${repositoryFullName}" already exists.`));
    } else {
      const forkOfRepository: FakeGitHubRepository | undefined = !forkOf ? undefined : await this.getRepository(forkOf);
      fakeRepository = new FakeGitHubRepository(repositoryFullName, forkOfRepository);
      if (forkOfRepository) {
        forkOfRepository.forks.push(fakeRepository);
      }
      this.repositories.push(fakeRepository);
      result = Promise.resolve(fakeRepository);
    }
    return result;
  }

  public createRepository(repository: string | GitHubRepository): Promise<FakeGitHubRepository> {
    return this.createRepositoryInner(repository);
  }

  public async forkRepository(repository: string | GitHubRepository, forkedRepositoryOwner: string): Promise<FakeGitHubRepository> {
    repository = getGitHubRepository(repository);
    const forkedRepository: GitHubRepository = {
      organization: forkedRepositoryOwner,
      name: repository.name,
    };
    return this.createRepositoryInner(forkedRepository, repository);
  }

  public deleteRepository(repository: string | GitHubRepository): Promise<void> {
    const repositoryFullName: string = getRepositoryFullName(repository);
    const deletedRepository: FakeGitHubRepository | undefined = removeFirst(this.repositories, (repo: FakeGitHubRepository) => repo.name === repositoryFullName);

    let result: Promise<void>;
    if (!deletedRepository) {
      result = Promise.reject(new GitHubError(`No fake repository exists with the name "${repositoryFullName}".`));
    } else {
      if (deletedRepository.forkOf) {
        removeFirst(deletedRepository.forkOf.forks, (fork: FakeGitHubRepository) => fork === deletedRepository);
      }
      result = Promise.resolve();
    }

    return result;
  }

  public createUser(username: string): Promise<GitHubUser> {
    let user: GitHubUser | undefined = first(this.users, (user: GitHubUser) => user.login === username);
    let result: Promise<GitHubUser>;
    if (user) {
      result = Promise.reject(new GitHubError(`A fake user with the username "${username}" already exists.`));
    } else {
      user = {
        id: 0,
        name: "Fake User Name",
        node_id: "Fake Node ID",
        login: username,
        url: `https://api.github.com/users/${username}`,
        site_admin: false,
        etag: "Fake ETag",
      };
      this.users.push(user);
      result = Promise.resolve(user);
    }
    return result;
  }

  public getUser(username: string): Promise<GitHubUser> {
    const user: GitHubUser | undefined = first(this.users, (user: GitHubUser) => user.login === username);
    let result: Promise<GitHubUser>;
    if (!user) {
      result = Promise.reject(new GitHubError(`No fake user with the username "${username}" exists.`));
    } else {
      result = Promise.resolve(user);
    }
    return result;
  }

  public async setCurrentUser(username: string): Promise<void> {
    this.currentUser = await this.getUser(username);
  }

  public async getLabel(repository: string | GitHubRepository, label: string): Promise<GitHubLabel> {
    let result: Promise<GitHubLabel>;
    const labels: GitHubLabel[] = await this.getLabels(repository);
    const githubLabel: GitHubLabel | undefined = first(labels, (l: GitHubLabel) => l.name === label);
    if (!githubLabel) {
      result = Promise.reject(new GitHubError(`No fake label named "${label}" found in the fake repository "${getRepositoryFullName(repository)}".`));
    } else {
      result = Promise.resolve(githubLabel);
    }
    return result;
  }

  public getCurrentUser(): Promise<GitHubUser> {
    return this.currentUser
      ? Promise.resolve(this.currentUser)
      : Promise.reject(new GitHubError(`No fake current user has been set.`));
  }

  public async getLabels(repository: string | GitHubRepository): Promise<GitHubLabel[]> {
    const fakeRepository: FakeGitHubRepository = await this.getRepository(repository);
    return fakeRepository.labels;
  }

  public async getSprintLabels(repository: string | GitHubRepository): Promise<GitHubSprintLabel[]> {
    const labels: GitHubLabel[] = await this.getLabels(repository);
    return getSprintLabels(labels);
  }

  public async createLabel(repository: string | GitHubRepository, labelName: string, color: string): Promise<GitHubLabel> {
    let result: Promise<GitHubLabel>;
    if (!labelName) {
      result = Promise.reject(new GitHubError(`labelName cannot be undefined or empty.`));
    } else if (!color) {
      result = Promise.reject(new GitHubError(`color cannot be undefined or empty.`));
    } else {
      const fakeRepository: FakeGitHubRepository = await this.getRepository(repository);
      const label: GitHubLabel = {
        id: 0,
        default: false,
        node_id: "fake label node_id",
        url: "fake label url",
        name: labelName,
        color: color
      };
      fakeRepository.labels.push(label);
      result = Promise.resolve(label);
    }
    return result;
  }

  public async deleteLabel(repository: string | GitHubRepository, label: string | GitHubLabel): Promise<void> {
    const labelName: string = (!label || typeof label === "string") ? label : label.name;
    let result: Promise<void>;
    if (!labelName) {
      result = Promise.reject(new GitHubError(`label cannot be undefined or an empty string.`));
    } else {
      const fakeRepository: FakeGitHubRepository = await this.getRepository(repository);
      const removedLabel: GitHubLabel | undefined = removeFirst(fakeRepository.labels, (label: GitHubLabel) => label.name === labelName);
      if (!removedLabel) {
        result = Promise.reject(new GitHubError(`No label named "${labelName}" found in the fake repository "${getRepositoryFullName(repository)}".`));
      } else {
        result = Promise.resolve();
      }
    }
    return result;
  }

  public async updateLabelColor(repository: string | GitHubRepository, labelName: string, newColor: string): Promise<unknown> {
    const fakeRepository: FakeGitHubRepository = await this.getRepository(repository);
    const label: GitHubLabel | undefined = first(fakeRepository.labels, (label: GitHubLabel) => label.name === labelName);
    let result: Promise<unknown>;
    if (!label) {
      result = Promise.reject(new GitHubError(`No label named "${labelName}" found in the fake repository "${getRepositoryFullName(repository)}".`));
    } else {
      label.color = newColor;
      result = Promise.resolve();
    }
    return result;
  }

  public async getMilestone(repository: string | GitHubRepository, milestone: string | number): Promise<GitHubMilestone> {
    const milestones: GitHubMilestone[] = await this.getMilestones(repository);
    let result: Promise<GitHubMilestone>;
    if (typeof milestone === "string") {
      const milestoneMatch: GitHubMilestone | undefined = first(milestones, (m: GitHubMilestone) => m.title === milestone);
      if (!milestoneMatch) {
        result = Promise.reject(new GitHubError(`No milestone found with the name "${milestone}" in the fake repository "${getRepositoryFullName(repository)}".`));
      } else {
        result = Promise.resolve(milestoneMatch);
      }
    } else {
      const milestoneMatch: GitHubMilestone | undefined = first(milestones, (m: GitHubMilestone) => m.number === milestone);
      if (!milestoneMatch) {
        result = Promise.reject(new GitHubError(`No milestone found with the id number ${milestone} in the fake repository "${getRepositoryFullName(repository)}".`));
      } else {
        result = Promise.resolve(milestoneMatch);
      }
    }
    return result;
  }

  public async getMilestones(repository: string | GitHubRepository, options?: GitHubGetMilestonesOptions): Promise<GitHubMilestone[]> {
    const fakeRepository: FakeGitHubRepository = await this.getRepository(repository);
    let result: GitHubMilestone[] = fakeRepository.milestones;
    if (options && options.open !== undefined) {
      result = where(result, (milestone: GitHubMilestone) => milestone.state === (options.open ? "open" : "closed"));
    }
    return result;
  }

  public async getSprintMilestones(repository: string | GitHubRepository, options?: GitHubGetMilestonesOptions): Promise<GitHubSprintMilestone[]> {
    const milestones: GitHubMilestone[] = await this.getMilestones(repository, options);
    return githubMilestonesToSprintMilestones(milestones);
  }

  public async createMilestone(repository: string | GitHubRepository, milestoneName: string, options?: GitHubCreateMilestoneOptions): Promise<GitHubMilestone> {
    const fakeRepository: FakeGitHubRepository = await this.getRepository(repository);
    const milestone: GitHubMilestone = {
      title: milestoneName,
      number: 0,
      due_on: addOffset(options && options.endDate || "2000-01-02"),
      state: "open",
      closed_issues: 0,
      open_issues: 0
    };
    fakeRepository.milestones.push(milestone);
    return milestone;
  }

  public async createSprintMilestone(repository: string | GitHubRepository, sprintNumber: number, sprintEndDate: string): Promise<GitHubSprintMilestone | undefined> {
    const milestoneName = getSprintMilestoneName(sprintNumber);
    const githubMilestone: GitHubMilestone = await this.createMilestone(repository, milestoneName, { endDate: sprintEndDate });
    return githubMilestoneToSprintMilestone(githubMilestone);
  }

  public async updateMilestoneEndDate(repository: string | GitHubRepository, milestoneNumber: number, newSprintEndDate: string): Promise<GitHubMilestone> {
    const milestone: GitHubMilestone = await this.getMilestone(repository, milestoneNumber);
    milestone.due_on = addOffset(newSprintEndDate);
    return milestone;
  }

  public async updateSprintMilestoneEndDate(repository: string | GitHubRepository, sprintMilestone: GitHubSprintMilestone, newSprintEndDate: string): Promise<GitHubSprintMilestone> {
    const githubMilestone: GitHubMilestone = await this.updateMilestoneEndDate(repository, sprintMilestone.milestoneNumber!, newSprintEndDate);
    return githubMilestoneToSprintMilestone(githubMilestone)!;
  }

  public async closeMilestone(repository: string | GitHubRepository, milestoneNumber: number): Promise<void> {
    const milestone: GitHubMilestone = await this.getMilestone(repository, milestoneNumber);
    milestone.state = "closed";
  }

  public closeSprintMilestone(repository: string | GitHubRepository, sprintMilestone: GitHubSprintMilestone): Promise<void> {
    return this.closeMilestone(repository, sprintMilestone.milestoneNumber!);
  }

  public async createFakePullRequest(repository: string | GitHubRepository, pullRequest: GitHubPullRequest): Promise<FakeGitHubPullRequest> {
    const fakeRepository: FakeGitHubRepository = await this.getRepository(repository);
    let result: Promise<FakeGitHubPullRequest> | undefined;
    if (!contains(fakeRepository.branches, (branch: GitHubBranch) => branch.name === pullRequest.base.ref)) {
      result = Promise.reject(new GitHubError(`No branch exists in the fake repository "${getRepositoryFullName(repository)}" with the name "${pullRequest.base.ref}".`));
    } else {
      const forkedRepositoryHeadBranch: ForkedRepositoryBranch = getForkedRepositoryBranch(pullRequest.head.label);
      if (!forkedRepositoryHeadBranch.username || forkedRepositoryHeadBranch.username === getGitHubRepository(fakeRepository.name).organization) {
        if (!contains(fakeRepository.branches, (branch: GitHubBranch) => branch.name === pullRequest.head.ref)) {
          result = Promise.reject(new GitHubError(`No branch exists in the fake repository "${getRepositoryFullName(repository)}" with the name "${pullRequest.head.ref}".`));
        }
      } else {
        const forkedRepository: FakeGitHubRepository | undefined = fakeRepository.getFork(forkedRepositoryHeadBranch.username);
        if (!forkedRepository) {
          result = Promise.reject(new GitHubError(`No fork of the fake repository "${getRepositoryFullName(repository)}" exists for the username/organization "${forkedRepositoryHeadBranch.username}".`));
        } else if (!contains(forkedRepository.branches, (branch: GitHubBranch) => branch.name === forkedRepositoryHeadBranch.branchName)) {
          result = Promise.reject(new GitHubError(`No branch exists in the forked fake repository "${forkedRepository.name}" with the name "${pullRequest.head.ref}".`));
        }
      }

      if (!result) {
        if (pullRequest.base.label === pullRequest.head.label) {
          result = Promise.reject(new GitHubError(`The base label ("${pullRequest.base.label}") cannot be the same as the head label ("${pullRequest.head.label}").`));
        } else {
          const existingPullRequest: FakeGitHubPullRequest | undefined = first(fakeRepository.pullRequests, (pr: FakeGitHubPullRequest) => pr.number === pullRequest.number);
          if (existingPullRequest) {
            result = Promise.reject(new GitHubError(`A pull request already exists in the fake repository "${getRepositoryFullName(repository)}" with the number ${pullRequest.number}.`));
          } else {
            pullRequest.body = pullRequest.body || "";
            const fakePullRequest: FakeGitHubPullRequest = {
              ...pullRequest,
              comments: [],
            };
            fakeRepository.pullRequests.push(fakePullRequest);
            result = Promise.resolve(fakePullRequest);
          }
        }
      }
    }
    return result;
  }

  public async createPullRequest(repository: string | GitHubRepository, baseBranch: string, headBranch: string | ForkedRepositoryBranch, title: string, options: GitHubCreatePullRequestOptions = {}): Promise<GitHubPullRequest> {
    const fakeRepository: FakeGitHubRepository = await this.getRepository(repository);
    const forkedRepositoryHeadBranch: ForkedRepositoryBranch = getForkedRepositoryBranch(headBranch);
    return this.createFakePullRequest(repository, {
      base: {
        label: baseBranch,
        ref: baseBranch,
        sha: "fake-base-sha",
      },
      diff_url: "fake-diff-url",
      head: {
        label: getForkedRepositoryBranchFullName(forkedRepositoryHeadBranch),
        ref: forkedRepositoryHeadBranch.branchName,
        sha: "fake-head-sha",
      },
      html_url: "fake-html-url",
      id: fakeRepository.pullRequests.length + 1,
      labels: [],
      number: fakeRepository.pullRequests.length + 1,
      state: "open",
      title,
      url: "fake-url",
      body: options && options.description
    });
  }

  public async closePullRequest(repository: string | GitHubRepository, pullRequestNumber: number | GitHubPullRequest): Promise<void> {
    const existingPullRequest: FakeGitHubPullRequest = await this.getPullRequest(repository, getPullRequestNumber(pullRequestNumber));
    existingPullRequest.state = "closed";
  }

  public async mergePullRequest(repository: string | GitHubRepository, pullRequest: number | GitHubPullRequest): Promise<void> {
    const existingPullRequest: FakeGitHubPullRequest = await this.getPullRequest(repository, getPullRequestNumber(pullRequest));
    let result: Promise<void>;
    if (existingPullRequest.state === "closed") {
      result = Promise.reject(new GitHubError(`The pull request (${getRepositoryFullName(repository)}/${existingPullRequest.number}) is already closed.`));
    } else {
      existingPullRequest.state = "closed";
      result = Promise.resolve();
    }
    return result;
  }

  public async getPullRequest(repository: string | GitHubRepository, pullRequestNumber: number): Promise<FakeGitHubPullRequest> {
    const pullRequests: FakeGitHubPullRequest[] = await this.getPullRequests(repository);
    const pullRequest: FakeGitHubPullRequest | undefined = first(pullRequests, (pr: FakeGitHubPullRequest) => pr.number === pullRequestNumber);
    return pullRequest
      ? Promise.resolve(pullRequest)
      : Promise.reject(new GitHubError(`No pull request found in fake repository "${getRepositoryFullName(repository)}" with number ${pullRequestNumber}.`));
  }

  public async getPullRequests(repository: string | GitHubRepository, options?: GitHubGetPullRequestsOptions): Promise<FakeGitHubPullRequest[]> {
    const fakeRepository: FakeGitHubRepository = await this.getRepository(repository);
    let result: FakeGitHubPullRequest[] = fakeRepository.pullRequests;
    if (options && options.open !== undefined) {
      result = where(result, (pullRequest: FakeGitHubPullRequest) => pullRequest.state === (options.open ? "open" : "closed"));
    }
    return result;
  }

  public async addPullRequestAssignees(repository: string | GitHubRepository, githubPullRequest: GitHubPullRequest | number, assignees: string | GitHubUser | (string | GitHubUser)[]): Promise<void> {
    const pullRequestNumber: number = getPullRequestNumber(githubPullRequest);
    const pullRequest: FakeGitHubPullRequest = await this.getPullRequest(repository, pullRequestNumber);

    if (!pullRequest.assignees) {
      pullRequest.assignees = [];
    }

    if (!Array.isArray(assignees)) {
      assignees = [assignees];
    }
    for (const assignee of assignees) {
      if (typeof assignee === "string") {
        pullRequest.assignees.push(await this.getUser(assignee));
      } else {
        pullRequest.assignees.push(assignee);
      }
    }
  }

  public async addPullRequestLabels(repository: string | GitHubRepository, githubPullRequest: GitHubPullRequest | number, labelNames: string | string[]): Promise<string[]> {
    const pullRequestNumber: number = getPullRequestNumber(githubPullRequest);
    const labelNamesArray: string[] = (Array.isArray(labelNames) ? labelNames : [labelNames]);

    const repositoryLabels: GitHubLabel[] = await this.getLabels(repository);
    for (const labelName of labelNamesArray) {
      if (!contains(repositoryLabels, (repositoryLabel: GitHubLabel) => repositoryLabel.name === labelName)) {
        repositoryLabels.push(await this.createLabel(repository, labelName, "ededed"));
      }
    }

    const pullRequest: FakeGitHubPullRequest = await this.getPullRequest(repository, pullRequestNumber);
    const pullRequestLabels: GitHubLabel[] = pullRequest.labels;
    const pullRequestLabelNames: string[] = map(pullRequestLabels, (label: GitHubLabel) => label.name);
    const labelNamesAddedToPullRequest: string[] = where(labelNamesArray, (labelName: string) => !contains(pullRequestLabelNames, labelName));
    if (labelNamesAddedToPullRequest.length > 0) {
      pullRequest.labels.push(...await Promise.all(map(labelNamesAddedToPullRequest, (labelName: string) => this.getLabel(repository, labelName))));
    }

    return labelNamesAddedToPullRequest;
  }

  public async removePullRequestLabels(repository: string | GitHubRepository, githubPullRequest: number | GitHubPullRequest, labelNames: string | string[]): Promise<string[]> {
    const pullRequestNumber: number = getPullRequestNumber(githubPullRequest);
    const pullRequest: FakeGitHubPullRequest = await this.getPullRequest(repository, pullRequestNumber);
    const labelNamesToRemove: string[] = (Array.isArray(labelNames) ? labelNames : [labelNames]);
    const currentLabelNames: string[] = map(pullRequest.labels, (label: GitHubLabel) => label.name);
    const removedLabelNames: string[] = where(currentLabelNames, (labelName: string) => contains(labelNamesToRemove, labelName));
    pullRequest.labels = where(pullRequest.labels, (label: GitHubLabel) => !contains(labelNamesToRemove, label.name));
    return removedLabelNames;
  }

  public setPullRequestMilestone(repository: string | GitHubRepository, githubPullRequest: GitHubPullRequest | number, milestone: string | number | GitHubMilestone): Promise<unknown> {
    const pullRequestNumber: number = getPullRequestNumber(githubPullRequest);
    return this.getPullRequest(repository, pullRequestNumber)
      .then((pullRequest: FakeGitHubPullRequest) => {
        let milestonePromise: Promise<GitHubMilestone>;
        if (typeof milestone === "string" || typeof milestone === "number") {
          milestonePromise = this.getMilestone(repository, milestone);
        } else {
          milestonePromise = Promise.resolve(milestone);
        }

        milestonePromise.then((githubMilestone: GitHubMilestone) => {
          pullRequest.milestone = githubMilestone;
        });
      });
  }

  public getPullRequestComments(repository: string | GitHubRepository, githubPullRequest: GitHubPullRequest | number): Promise<GitHubComment[]> {
    const pullRequestNumber: number = getPullRequestNumber(githubPullRequest);
    return this.getPullRequest(repository, pullRequestNumber)
      .then((fakePullRequest: FakeGitHubPullRequest) => fakePullRequest.comments);
  }

  public async getPullRequestComment(repository: string | GitHubRepository, githubPullRequest: GitHubPullRequest | number, comment: GitHubComment | number): Promise<GitHubComment> {
    const pullRequestNumber: number = getPullRequestNumber(githubPullRequest);
    const fakePullRequest: FakeGitHubPullRequest = await this.getPullRequest(repository, pullRequestNumber);
    const comments: GitHubComment[] = fakePullRequest.comments;
    const commentId: number = typeof comment === "number" ? comment : comment.id;
    const result: GitHubComment | undefined = first(comments, (comment: GitHubComment) => comment.id === commentId);
    if (!result) {
      throw new GitHubError(`No comment exists in pull request ${pullRequestNumber} in ${getRepositoryFullName(repository)} with id ${commentId}.`);
    }
    return clone(result);
  }

  public async createPullRequestComment(repository: string | GitHubRepository, githubPullRequest: GitHubPullRequest | number, commentBody: string): Promise<GitHubComment> {
    const comments: GitHubComment[] = await this.getPullRequestComments(repository, githubPullRequest);
    const currentUser: GitHubUser = await this.getCurrentUser();
    const newComment: GitHubComment = {
      id: comments.length + 1,
      node_id: "fake_node_id",
      user: currentUser,
      html_url: "fake_html_url",
      url: "fake_url",
      body: commentBody,
      created_at: "fake_created_at",
      updated_at: "fake_updated_at",
      etag: "1",
    };
    comments.push(newComment);
    return clone(newComment);
  }

  public async updatePullRequestComment(repository: string | GitHubRepository, githubPullRequest: GitHubPullRequest | number, comment: number | GitHubComment, commentBody: string, etag?: string): Promise<GitHubComment> {
    const comments: GitHubComment[] = await this.getPullRequestComments(repository, githubPullRequest);

    const commentId: number = getCommentId(comment);
    const commentToUpdate: GitHubComment | undefined = first(comments, (existingComment: GitHubComment) => existingComment.id === commentId);
    if (!commentToUpdate) {
      throw new GitHubError(`No comment found with the ID ${commentId}.`);
    } else if (etag != undefined && commentToUpdate.etag !== etag) {
      throw new GitHubError(`Can't update comment with ID ${commentId} because the provided etag (${etag}) doesn't match the existing etag.`, {
        statusCode: 412
      });
    }

    commentToUpdate.body = commentBody;
    commentToUpdate.etag = (Number.parseInt(commentToUpdate.etag) + 1).toString();
    return clone(commentToUpdate);
  }

  public deletePullRequestComment(repository: string | GitHubRepository, githubPullRequest: number | GitHubPullRequest, comment: number | GitHubComment): Promise<unknown> {
    const pullRequestNumber: number = getPullRequestNumber(githubPullRequest);
    return this.getPullRequest(repository, pullRequestNumber)
      .then((pullRequest: FakeGitHubPullRequest) => {
        let result: Promise<unknown>;
        const commentId: number = getCommentId(comment);
        if (!contains(pullRequest.comments, (existingComment: GitHubComment) => existingComment.id === commentId)) {
          result = Promise.reject(new GitHubError(`No comment was found with the id ${commentId}.`));
        } else {
          pullRequest.comments = where(pullRequest.comments, (existingComment: GitHubComment) => existingComment.id !== commentId);
          result = Promise.resolve();
        }
        return result;
      });
  }

  public getCommit(repository: string | GitHubRepository, commitId: string): Promise<GitHubCommit | undefined> {
    return this.getRepository(repository)
      .then((fakeRepository: FakeGitHubRepository) => {
        return first(fakeRepository.commits, (commit: GitHubCommit) => commit.sha.startsWith(commitId));
      });
  }

  public createCommit(repository: string | GitHubRepository, commitId: string, message: string): Promise<unknown> {
    return this.getRepository(repository)
      .then((fakeRepository: FakeGitHubRepository) => {
        fakeRepository.commits.push({
          sha: commitId,
          commit: {
            message
          }
        });
      });
  }

  public getAllReferences(repository: string | GitHubRepository): Promise<GitHubReference[]> {
    return this.getRepository(repository)
      .then((fakeRepository: FakeGitHubRepository) => {
        return fakeRepository.branches;
      });
  }

  public getAllBranches(repository: string | GitHubRepository): Promise<GitHubBranch[]> {
    return this.getAllReferences(repository)
      .then(referencesToBranches);
  }

  public getBranch(repository: string | GitHubRepository, branchName: string): Promise<GitHubBranch> {
    return this.getRepository(repository)
      .then((fakeRepository: FakeGitHubRepository) => {
        const result: GitHubBranch | undefined = first(fakeRepository.branches, (branch: GitHubBranch) => branch.name === branchName);
        if (!result) {
          throw new GitHubError(`Could not get details about the branch "${branchName}" in repository "${fakeRepository.name}" because the branch didn't exist.`);
        }
        return result;
      });
  }

  public deleteBranch(repository: string | GitHubRepository, branchName: string): Promise<unknown> {
    return this.getRepository(repository)
      .then((fakeRepository: FakeGitHubRepository) => {
        const removedBranch: GitHubBranch | undefined = removeFirst(fakeRepository.branches, (branch: GitHubBranch) => branch.name === branchName);
        if (!removedBranch) {
          throw new GitHubError(`Could not delete branch "${branchName}" from repository "${fakeRepository.name}" because the branch didn't exist.`);
        }
      });
  }

  public createBranch(repository: string | GitHubRepository, branchName: string, branchSha: string): Promise<GitHubBranch> {
    return this.getRepository(repository)
      .then((fakeRepository: FakeGitHubRepository) => {
        let result: GitHubBranch;
        if (contains(fakeRepository.branches, (branch: GitHubBranch) => branch.name === branchName)) {
          throw new GitHubError(`Could not create a branch named "${branchName}" in repository "${fakeRepository.name}" because a branch with that name already exists.`);
        } else if (!contains(fakeRepository.commits, (commit: GitHubCommit) => commit.sha === branchSha)) {
          throw new GitHubError(`Could not create a branch named "${branchName}" in repository "${fakeRepository.name}" with the SHA "${branchSha}" because no commit exists in the repository with the provided SHA.`);
        } else {
          result = {
            name: branchName,
            ref: `refs/heads/${branchName}`,
            node_id: "fake-node-id",
            url: "fake-branch-url",
            object: {
              type: "commit",
              sha: branchSha,
              url: "fake-branch-commit-sha",
            }
          };
          fakeRepository.branches.push(result);
        }
        return result;
      });
  }
}

export function getSprintLabels(labels: GitHubLabel[]): GitHubSprintLabel[] {
  const repositorySprintLabels: GitHubSprintLabel[] = [];
  for (const repositoryLabel of labels) {
    if (repositoryLabel && repositoryLabel.name && repositoryLabel.name.includes("-Sprint-")) {
      const repositoryLabelName: string = repositoryLabel.name;

      const firstDashIndex: number = repositoryLabelName.indexOf("-");
      const sprintLabelType: string = repositoryLabelName.substring(0, firstDashIndex);

      const lastDashIndex: number = repositoryLabelName.lastIndexOf("-");
      const sprintNumber: number = parseInt(repositoryLabelName.substring(lastDashIndex + 1));

      let sprintLabel: GitHubSprintLabel | undefined = first(repositorySprintLabels, (resultLabel: GitHubSprintLabel) => resultLabel.sprint === sprintNumber);
      if (sprintLabel == undefined) {
        sprintLabel = {
          sprint: sprintNumber
        };
        repositorySprintLabels.push(sprintLabel);
      }
      (sprintLabel as any)[sprintLabelType.toLowerCase() + "Color"] = repositoryLabel.color;
    }
  }
  return repositorySprintLabels;
}

/**
 * A class that wraps @octokit/rest to interact with github.com.
 */
export class RealGitHub implements GitHub {
  private constructor(private readonly github: Octokit) {
  }

  public static fromOctokit(github: Octokit): RealGitHub {
    return new RealGitHub(github);
  }

  public static fromToken(authenticationToken: string): RealGitHub {
    const github = new Octokit();
    if (authenticationToken) {
      github.authenticate({
        type: "token",
        token: authenticationToken
      });
    }
    return new RealGitHub(github);
  }

  public static fromTokenFile(tokenFilePath: string): RealGitHub {
    if (!fs.existsSync(tokenFilePath)) {
      throw new GitHubError(`The file ${tokenFilePath} doesn't exist. Create a GitHub personal access token, create this file with the personal access token as its contents, and then run this application again.`);
    }

    const githubAuthToken: string = fs.readFileSync(tokenFilePath, { encoding: "utf-8" });

    return RealGitHub.fromToken(githubAuthToken);
  }

  public getCurrentUser(): Promise<GitHubUser> {
    return new Promise((resolve, reject) => {
      this.github.users.get({
      }, (error: Error | null, response: Octokit.AnyResponse) => {
        if (error) {
          reject(error);
        } else {
          const result: GitHubUser = {
            etag: response.headers.etag,
            id: response.data.id,
            login: response.data.login,
            name: response.data.name,
            node_id: response.data.node_id,
            site_admin: response.data.site_admin,
            url: response.data.url,
          };
          resolve(result);
        }
      });
    });
  }

  public getLabels(repository: string | GitHubRepository): Promise<GitHubLabel[]> {
    const githubRepository: GitHubRepository = getGitHubRepository(repository);
    return new Promise((resolve, reject) => {
      this.github.issues.getLabels({
        owner: githubRepository.organization,
        repo: githubRepository.name
      }, (error: Error | null, response: Octokit.AnyResponse) => {
        if (error) {
          reject(error);
        } else {
          resolve(this.getAllPageData(response));
        }
      });
    });
  }

  public getSprintLabels(repository: string | GitHubRepository): Promise<GitHubSprintLabel[]> {
    return this.getLabels(repository).then(getSprintLabels);
  }

  public createLabel(repository: string | GitHubRepository, labelName: string, color: string): Promise<GitHubLabel> {
    const githubRepository: GitHubRepository = getGitHubRepository(repository);
    return new Promise((resolve, reject) => {
      this.github.issues.createLabel({
        owner: githubRepository.organization,
        repo: githubRepository.name,
        name: labelName,
        color: color
      }, (error: Error | null, response: Octokit.AnyResponse) => {
        if (error) {
          reject(error);
        } else {
          resolve(response.data as GitHubLabel);
        }
      });
    });
  }

  public deleteLabel(repository: string | GitHubRepository, label: string | GitHubLabel): Promise<unknown> {
    const githubRepository: GitHubRepository = getGitHubRepository(repository);
    const labelName: string = (!label || typeof label === "string") ? label : label.name;
    const githubArguments: Octokit.IssuesDeleteLabelParams = {
      owner: githubRepository.organization,
      repo: githubRepository.name,
      name: labelName
    };
    return new Promise((resolve, reject) => {
      this.github.issues.deleteLabel(githubArguments, (error: Error | null) => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
    });
  }

  public updateLabelColor(repository: string | GitHubRepository, labelName: string, newColor: string): Promise<unknown> {
    const githubRepository: GitHubRepository = getGitHubRepository(repository);
    return new Promise((resolve, reject) => {
      this.github.issues.updateLabel({
        owner: githubRepository.organization,
        repo: githubRepository.name,
        current_name: labelName,
        color: newColor
      } as any,
        (error: Error | null) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        });
    });
  }

  public getMilestone(repository: string | GitHubRepository, milestone: number | string): Promise<GitHubMilestone> {
    const githubRepository: GitHubRepository = getGitHubRepository(repository);
    return new Promise((resolve, reject) => {
      if (typeof milestone === "number") {
        this.github.issues.getMilestone({
          owner: githubRepository.organization,
          repo: githubRepository.name,
          number: milestone
        }, (error: Error | null, response: Octokit.AnyResponse) => {
          if (error) {
            reject(error);
          } else {
            resolve(response.data);
          }
        });
      } else {
        resolve(this.getMilestones(githubRepository)
          .then((githubMilestones: GitHubMilestone[]) => {
            const githubMilestone: GitHubMilestone | undefined = first(githubMilestones, (githubMilestone: GitHubMilestone) => githubMilestone.title === milestone);
            if (!githubMilestone) {
              throw new GitHubError(`Could not find a milestone in repository "${getRepositoryFullName(githubRepository)}" with the name "${milestone}".`);
            }
            return githubMilestone;
          }));
      }
    });
  }

  /**
   * Get all of the milestones that exist in the repository with the provided name.
   * @param repositoryName The name of the repository to get all of the milestones of.
   * @returns All of the milestones that exist in the provided repository.
   */
  public getMilestones(repository: string | GitHubRepository, options?: GitHubGetMilestonesOptions): Promise<GitHubMilestone[]> {
    let milestoneState: GitHubMilestoneState | "all" = "all";
    if (options) {
      if (options.open === true) {
        milestoneState = "open";
      } else if (options.open === false) {
        milestoneState = "closed";
      }
    }

    const githubRepository: GitHubRepository = getGitHubRepository(repository);
    return new Promise((resolve, reject) => {
      const getMilestonesArguments: Octokit.IssuesGetMilestonesParams = {
        owner: githubRepository.organization,
        repo: githubRepository.name,
        state: milestoneState
      };
      this.github.issues.getMilestones(getMilestonesArguments, (error: Error | null, response: Octokit.AnyResponse) => {
        if (error) {
          reject(error);
        } else {
          resolve(this.getAllPageData<GitHubMilestone>(response));
        }
      });
    });
  }

  public getSprintMilestones(repository: string | GitHubRepository, options?: GitHubGetMilestonesOptions): Promise<GitHubSprintMilestone[]> {
    return this.getMilestones(repository, options)
      .then(githubMilestonesToSprintMilestones);
  }

  public createMilestone(repository: string | GitHubRepository, milestoneName: string, options?: GitHubCreateMilestoneOptions): Promise<GitHubMilestone> {
    const githubRepository: GitHubRepository = getGitHubRepository(repository);
    const createMilestoneArguments: Octokit.IssuesCreateMilestoneParams = {
      owner: githubRepository.organization,
      repo: githubRepository.name,
      title: milestoneName
    };

    if (options && options.endDate) {
      createMilestoneArguments.due_on = addOffset(options.endDate);
    }

    return new Promise((resolve, reject) => {
      this.github.issues.createMilestone(createMilestoneArguments, (error: Error | null, response: Octokit.AnyResponse) => {
        if (error) {
          reject(error);
        } else {
          resolve(response.data);
        }
      });
    });
  }

  public createSprintMilestone(repository: string | GitHubRepository, sprintNumber: number, sprintEndDate: string): Promise<GitHubSprintMilestone | undefined> {
    const milestoneName = getSprintMilestoneName(sprintNumber);
    return this.createMilestone(repository, milestoneName, { endDate: sprintEndDate })
      .then((githubMilestone: GitHubMilestone) => {
        return githubMilestoneToSprintMilestone(githubMilestone);
      });
  }

  public updateMilestoneEndDate(repository: string | GitHubRepository, milestoneNumber: number, newSprintEndDate: string): Promise<GitHubMilestone> {
    newSprintEndDate = addOffset(newSprintEndDate);
    const githubRepository: GitHubRepository = getGitHubRepository(repository);
    return new Promise((resolve, reject) => {
      this.github.issues.updateMilestone({
        owner: githubRepository.organization,
        repo: githubRepository.name,
        number: milestoneNumber,
        due_on: newSprintEndDate
      }, (error: Error | null, response: Octokit.AnyResponse) => {
        if (error) {
          reject(error);
        } else {
          resolve(response.data);
        }
      });
    });
  }

  public updateSprintMilestoneEndDate(repository: string | GitHubRepository, sprintMilestone: GitHubSprintMilestone, newSprintEndDate: string): Promise<GitHubSprintMilestone> {
    return this.updateMilestoneEndDate(repository, sprintMilestone.milestoneNumber!, newSprintEndDate)
      .then((githubMilestone: GitHubMilestone) => {
        return githubMilestoneToSprintMilestone(githubMilestone)!;
      });
  }

  public closeMilestone(repository: string | GitHubRepository, milestoneNumber: number): Promise<unknown> {
    const githubRepository: GitHubRepository = getGitHubRepository(repository);
    return new Promise((resolve, reject) => {
      this.github.issues.updateMilestone({
        owner: githubRepository.organization,
        repo: githubRepository.name,
        number: milestoneNumber,
        state: "closed"
      }, (error: Error | null) => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
    });
  }

  public closeSprintMilestone(repository: string | GitHubRepository, sprintMilestone: GitHubSprintMilestone): Promise<unknown> {
    return this.closeMilestone(repository, sprintMilestone.milestoneNumber!);
  }

  public createPullRequest(repository: string | GitHubRepository, baseBranch: string, headBranch: string | ForkedRepositoryBranch, title: string, options: GitHubCreatePullRequestOptions = {}): Promise<GitHubPullRequest> {
    const githubRepository: GitHubRepository = getGitHubRepository(repository);
    const githubArguments: Octokit.PullRequestsCreateParams = {
      owner: githubRepository.organization,
      repo: githubRepository.name,
      base: baseBranch,
      head: getForkedRepositoryBranchFullName(headBranch),
      title: title,
      body: options && options.description
    };
    return this.github.pullRequests.create(githubArguments)
      .then((response: Octokit.AnyResponse) => {
        const result: GitHubPullRequest = response.data as GitHubPullRequest;
        result.body = result.body || "";
        return result;
      });
  }

  public closePullRequest(repository: string | GitHubRepository, pullRequest: number | GitHubPullRequest): Promise<unknown> {
    const githubRepository: GitHubRepository = getGitHubRepository(repository);
    const githubArguments: Octokit.PullRequestsUpdateParams = {
      owner: githubRepository.organization,
      repo: githubRepository.name,
      number: getPullRequestNumber(pullRequest),
      state: "closed",
    };
    return this.github.pullRequests.update(githubArguments)
      .then((response: Octokit.AnyResponse) => {
        return response.data;
      });
  }

  public mergePullRequest(repository: string | GitHubRepository, pullRequest: number | GitHubPullRequest): Promise<unknown> {
    const githubRepository: GitHubRepository = getGitHubRepository(repository);
    const githubArguments: Octokit.PullRequestsMergeParams = {
      owner: githubRepository.organization,
      repo: githubRepository.name,
      number: getPullRequestNumber(pullRequest),
    };
    return this.github.pullRequests.merge(githubArguments)
      .then((response: Octokit.AnyResponse) => {
        return response.data;
      });
  }

  public getPullRequest(repository: string | GitHubRepository, pullRequestNumber: number): Promise<GitHubPullRequest> {
    const githubRepository: GitHubRepository = getGitHubRepository(repository);
    const githubArguments: Octokit.PullRequestsGetParams = {
      owner: githubRepository.organization,
      repo: githubRepository.name,
      number: pullRequestNumber
    };
    return this.github.pullRequests.get(githubArguments)
      .then((response: Octokit.AnyResponse) => {
        const result: GitHubPullRequest = response.data as GitHubPullRequest;
        result.body = result.body || "";
        return result;
      });
  }

  public getPullRequests(repository: string | GitHubRepository, options?: GitHubGetPullRequestsOptions): Promise<GitHubPullRequest[]> {
    let pullRequestState: GitHubPullRequestState | "all" = "all";
    if (options) {
      if (options.open === true) {
        pullRequestState = "open";
      } else if (options.open === false) {
        pullRequestState = "closed";
      }
    }

    const githubRepository: GitHubRepository = getGitHubRepository(repository);
    const githubArguments: Octokit.PullRequestsGetAllParams = {
      owner: githubRepository.organization,
      repo: githubRepository.name,
      state: pullRequestState
    };
    return this.github.pullRequests.getAll(githubArguments)
      .then((response: Octokit.AnyResponse) => this.getAllPageData<GitHubPullRequest>(response));
  }

  public addPullRequestAssignees(repository: string | GitHubRepository, githubPullRequest: GitHubPullRequest | number, assignees: string | GitHubUser | (string | GitHubUser)[]): Promise<unknown> {
    return new Promise((resolve, reject) => {
      let assigneeLogins: string[];
      if (typeof assignees === "string") {
        assigneeLogins = [assignees];
      } else if (!(assignees instanceof Array)) {
        assigneeLogins = [assignees.login];
      } else {
        assigneeLogins = map(assignees, (assignee: string | GitHubUser) => {
          return typeof assignee === "string" ? assignee : assignee.login;
        });
      }

      const currentAssigneeLogins: string[] = typeof githubPullRequest === "number" ? [] : map(githubPullRequest.assignees, (assignee: GitHubUser) => assignee.login);
      const assigneeLoginsToAdd: string[] = where(assigneeLogins, (assigneeLogin: string) => !contains(currentAssigneeLogins, assigneeLogin));

      if (assigneeLoginsToAdd.length === 0) {
        resolve();
      } else {
        const updatedAssigneeLogins: string[] = [...currentAssigneeLogins, ...assigneeLoginsToAdd];
        const githubRepository: GitHubRepository = getGitHubRepository(repository);
        this.github.issues.edit({
          owner: githubRepository.organization,
          repo: githubRepository.name,
          number: getPullRequestNumber(githubPullRequest),
          assignees: updatedAssigneeLogins
        }, (error: Error | null) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        });
      }
    });
  }

  public addPullRequestLabels(repository: string | GitHubRepository, githubPullRequest: GitHubPullRequest | number, labelNames: string | string[]): Promise<string[]> {
    return new Promise((resolve, reject) => {
      const labelNamesArray: string[] = (typeof labelNames === "string" ? [labelNames] : labelNames);
      const pullRequestNumber: number = getPullRequestNumber(githubPullRequest);
      return this.getPullRequest(repository, pullRequestNumber)
        .then((pullRequest: GitHubPullRequest) => {
          const currentLabelNames: string[] = map(pullRequest.labels, (label: GitHubLabel) => label.name);
          const labelNamesToAdd: string[] = where(labelNamesArray, (labelName: string) => !contains(currentLabelNames, labelName));

          if (labelNamesToAdd.length === 0) {
            resolve(labelNamesToAdd);
          } else {
            const updatedLabelNamesArray: string[] = [...currentLabelNames, ...labelNamesToAdd];
            const githubRepository: GitHubRepository = getGitHubRepository(repository);
            this.github.issues.edit({
              owner: githubRepository.organization,
              repo: githubRepository.name,
              number: getPullRequestNumber(githubPullRequest),
              labels: updatedLabelNamesArray
            }, (error: Error | null) => {
              if (error) {
                reject(error);
              } else {
                resolve(labelNamesToAdd);
              }
            });
          }
        })
        .catch(reject);
    });
  }

  public removePullRequestLabels(repository: string | GitHubRepository, githubPullRequest: number | GitHubPullRequest, labelNames: string | string[]): Promise<string[]> {
    return new Promise(async (resolve, reject) => {
      const labelNamesArray: string[] = (typeof labelNames === "string" ? [labelNames] : labelNames);
      const pullRequestNumber: number = getPullRequestNumber(githubPullRequest);
      return this.getPullRequest(repository, pullRequestNumber)
        .then((pullRequest: GitHubPullRequest) => {
          const currentLabelNames: string[] = map(pullRequest.labels, (label: GitHubLabel) => label.name);
          const removedLabelNames: string[] = where(currentLabelNames, (currentLabelName: string) => contains(labelNamesArray, currentLabelName));
          if (removedLabelNames.length === 0) {
            resolve(removedLabelNames);
          } else {
            const updatedLabelNamesArray: string[] = where(currentLabelNames, (currentLabelName: string) => !contains(labelNamesArray, currentLabelName));
            const githubRepository: GitHubRepository = getGitHubRepository(repository);
            this.github.issues.edit({
              owner: githubRepository.organization,
              repo: githubRepository.name,
              number: pullRequestNumber,
              labels: updatedLabelNamesArray
            }, (error: Error | null) => {
              if (error) {
                reject(error);
              } else {
                resolve(removedLabelNames);
              }
            });
          }
        })
        .catch(reject);
    });
  }

  public setPullRequestMilestone(repository: string | GitHubRepository, githubPullRequest: GitHubPullRequest | number, milestone: number | string | GitHubMilestone): Promise<unknown> {
    let milestoneNumberPromise: Promise<number>;
    if (typeof milestone === "number") {
      milestoneNumberPromise = Promise.resolve(milestone);
    } else if (typeof milestone === "string") {
      milestoneNumberPromise = this.getMilestone(repository, milestone).then((githubMilestone: GitHubMilestone) => githubMilestone.number);
    } else {
      milestoneNumberPromise = Promise.resolve(milestone.number);
    }

    return milestoneNumberPromise
      .then((milestoneNumber: number) => {
        return new Promise<unknown>((resolve, reject) => {
          const githubRepository: GitHubRepository = getGitHubRepository(repository);
          this.github.issues.edit({
            owner: githubRepository.organization,
            repo: githubRepository.name,
            number: getPullRequestNumber(githubPullRequest),
            milestone: milestoneNumber
          }, (error: Error | null) => {
            if (error) {
              reject(error);
            } else {
              resolve();
            }
          });
        });
      });
  }

  /**
   * Get all of the pages associated with the provided pageResponse.
   * @param pageResponse One of the page responses in an overall response.
   * @param condition The condition that each data element must pass to be added to the result list.
   * @param result The result array with the paged data.
   */
  private getAllPageData<T>(pageResponse: Octokit.AnyResponse, condition: (data: T) => boolean = () => true, result: T[] = []): Promise<T[]> {
    if (pageResponse && pageResponse.data) {
      for (const dataElement of pageResponse.data) {
        if (!condition || condition(dataElement)) {
          result.push(dataElement);
        }
      }
    }

    return new Promise((resolve, reject) => {
      if (!pageResponse.headers || !this.github.hasNextPage(pageResponse as any)) {
        resolve(result);
      } else {
        this.github.getNextPage(pageResponse as any, (error: Error | null, response: Octokit.AnyResponse) => {
          if (error) {
            reject(error);
          } else {
            resolve(this.getAllPageData(response, condition, result));
          }
        });
      }
    });
  }

  public getPullRequestComments(repository: string | GitHubRepository, githubPullRequest: GitHubPullRequest | number): Promise<GitHubComment[]> {
    const githubRepository: GitHubRepository = getGitHubRepository(repository);
    const githubArguments: Octokit.IssuesGetCommentsParams = {
      owner: githubRepository.organization,
      repo: githubRepository.name,
      number: getPullRequestNumber(githubPullRequest)
    };
    return this.github.issues.getComments(githubArguments)
      .then((response: Octokit.AnyResponse) => this.getAllPageData<GitHubComment>(response));
  }

  public async getPullRequestComment(repository: string | GitHubRepository, _githubPullRequest: GitHubPullRequest | number, comment: GitHubComment | number): Promise<GitHubComment> {
    const githubRepository: GitHubRepository = getGitHubRepository(repository);
    const commentId: number = typeof comment === "number" ? comment : comment.id;
    const githubArguments: Octokit.IssuesGetCommentParams = {
      owner: githubRepository.organization,
      repo: githubRepository.name,
      comment_id: commentId,
    };
    const response = await this.github.issues.getComment(githubArguments);
    const result: GitHubComment = {
      ...response.data,
      etag: response.headers.etag,
    };
    return result;
  }

  public async createPullRequestComment(repository: string | GitHubRepository, githubPullRequest: GitHubPullRequest | number, commentBody: string): Promise<GitHubComment> {
    const githubRepository: GitHubRepository = getGitHubRepository(repository);
    const githubArguments: Octokit.IssuesCreateCommentParams = {
      owner: githubRepository.organization,
      repo: githubRepository.name,
      number: getPullRequestNumber(githubPullRequest),
      body: commentBody
    };
    const response: Octokit.Response<Octokit.IssuesCreateCommentResponse> = await this.github.issues.createComment(githubArguments);
    const result: GitHubComment = {
      ...response.data,
      etag: response.headers.etag,
    };
    return result;
  }

  public async updatePullRequestComment(repository: string | GitHubRepository, _githubPullRequest: GitHubPullRequest | number, comment: GitHubComment | number, commentBody: string, etag?: string): Promise<GitHubComment> {
    const githubRepository: GitHubRepository = getGitHubRepository(repository);
    const commentId: string = getCommentId(comment).toString();
    const githubArguments: Octokit.IssuesEditCommentParams = {
      owner: githubRepository.organization,
      repo: githubRepository.name,
      comment_id: commentId,
      body: commentBody,
    } as any;
    if (etag) {
      (githubArguments as any).headers = {
        "If-Match": etag,
      };
    }
    let result: GitHubComment;
    try {
      const response: Octokit.Response<Octokit.IssuesEditCommentResponse> = await this.github.issues.editComment(githubArguments);
      result = {
        ...response.data,
        etag: response.headers.etag,
      };
    } catch (error) {
      if (etag && (error as any).code === 412) {
        // const updatedComment: GitHubComment = await this.getPullRequestComment(repository, githubPullRequest, comment);
        // if (updatedComment.body !== commentBody) {
          throw new GitHubError(`Can't update comment with ID ${commentId} because the provided etag (${etag}) doesn't match the existing etag.`, {
            statusCode: 412,
          });
        // } else {
        //   result = updatedComment;
        // }
      } else {
        throw error;
      }
    }
    return result;
  }

  public deletePullRequestComment(repository: string | GitHubRepository, _githubPullRequest: number | GitHubPullRequest, comment: number | GitHubComment): Promise<unknown> {
    const githubRepository: GitHubRepository = getGitHubRepository(repository);
    const githubArguments: Octokit.IssuesDeleteCommentParams = {
      owner: githubRepository.organization,
      repo: githubRepository.name,
      comment_id: getCommentId(comment).toString()
    } as any;
    return this.github.issues.deleteComment(githubArguments);
  }

  public getCommit(repository: string | GitHubRepository, commit: string): Promise<GitHubCommit | undefined> {
    const githubRepository: GitHubRepository = getGitHubRepository(repository);
    const githubArguments: Octokit.ReposGetCommitParams = {
      owner: githubRepository.organization,
      repo: githubRepository.name,
      sha: commit
    };
    return this.github.repos.getCommit(githubArguments)
      .then((response: Octokit.AnyResponse) => {
        let commit: GitHubCommit | undefined;
        if (response.data) {
          commit = response.data;
        }
        return commit;
      })
      .catch((error: Error) => {
        let result: Promise<GitHubCommit | undefined>;
        if (error.message.toLowerCase().includes("no commit found")) {
          result = Promise.resolve(undefined);
        } else {
          result = Promise.reject(error);
        }
        return result;
      });
  }

  public getAllReferences(repository: string | GitHubRepository): Promise<GitHubReference[]> {
    const githubRepository: GitHubRepository = getGitHubRepository(repository);
    const githubArguments: Octokit.GitdataGetReferencesParams = {
      owner: githubRepository.organization,
      repo: githubRepository.name,
    };
    return this.github.gitdata.getReferences(githubArguments)
      .then((response: Octokit.AnyResponse) => {
        return this.getAllPageData<GitHubReference>(response);
      });
  }

  public getAllBranches(repository: string | GitHubRepository): Promise<GitHubBranch[]> {
    const githubRepository: GitHubRepository = getGitHubRepository(repository);
    const githubArguments: Octokit.GitdataGetReferencesParams = {
      owner: githubRepository.organization,
      repo: githubRepository.name,
      namespace: "heads/",
    };
    return this.github.gitdata.getReferences(githubArguments)
      .then((response: Octokit.AnyResponse) => {
        return this.getAllPageData<GitHubReference>(response);
      })
      .then(referencesToBranches);
  }

  public getBranch(repository: string | GitHubRepository, branchName: string): Promise<GitHubBranch> {
    const githubRepository: GitHubRepository = getGitHubRepository(repository);
    const githubArguments: Octokit.GitdataGetReferenceParams = {
      owner: githubRepository.organization,
      repo: githubRepository.name,
      ref: `heads/${branchName}`,
    };
    return !branchName
      ? Promise.reject(new GitHubError(`Cannot get branch details about an empty or undefined branch.`))
      : this.github.gitdata.getReference(githubArguments)
        .then((response: Octokit.AnyResponse) => {
          const githubReference: GitHubReference = response.data;
          return {
            ...githubReference,
            name: branchName,
          };
        });
  }

  public deleteBranch(repository: string | GitHubRepository, branchName: string): Promise<unknown> {
    const githubRepository: GitHubRepository = getGitHubRepository(repository);
    const githubArguments: Octokit.GitdataDeleteReferenceParams = {
      owner: githubRepository.organization,
      repo: githubRepository.name,
      ref: `heads/${branchName}`,
    };
    return this.github.gitdata.deleteReference(githubArguments);
  }

  public createBranch(repository: string | GitHubRepository, branchName: string, branchSha: string): Promise<GitHubBranch> {
    const githubRepository: GitHubRepository = getGitHubRepository(repository);
    const githubArguments: Octokit.GitdataCreateReferenceParams = {
      owner: githubRepository.organization,
      repo: githubRepository.name,
      ref: `refs/heads/${branchName}`,
      sha: branchSha,
    };
    return this.github.gitdata.createReference(githubArguments)
      .then((response: Octokit.AnyResponse) => {
        const reference: GitHubReference = response.data;
        const result: GitHubBranch = {
          name: branchName,
          ...reference,
        };
        return result;
      });
  }
}

function referencesToBranches(references: GitHubReference[]): GitHubBranch[] {
  return map(references, (reference: GitHubReference) => {
    return {
      ...reference,
      name: reference.ref.substring("refs/heads/".length),
    };
  });
}

function githubMilestonesToSprintMilestones(githubMilestones: GitHubMilestone[]): GitHubSprintMilestone[] {
  const result: GitHubSprintMilestone[] = [];
  for (const githubMilestone of githubMilestones) {
    const sprintMilestone: GitHubSprintMilestone | undefined = githubMilestoneToSprintMilestone(githubMilestone);
    if (sprintMilestone) {
      result.push(sprintMilestone);
    }
  }
  return result;
}

function githubMilestoneToSprintMilestone(githubMilestone: GitHubMilestone): GitHubSprintMilestone | undefined {
  let result: GitHubSprintMilestone | undefined;

  if (githubMilestone && githubMilestone.title && githubMilestone.title.startsWith("Sprint-")) {
    const sprintNumber: number = parseInt(githubMilestone.title.substring(githubMilestone.title.indexOf("-") + 1));

    let sprintEndDate: string = githubMilestone.due_on;
    if (sprintEndDate && sprintEndDate.includes("T")) {
      sprintEndDate = sprintEndDate.substring(0, sprintEndDate.indexOf("T"));
    }

    result = {
      sprint: sprintNumber,
      endDate: sprintEndDate,
      milestoneNumber: githubMilestone.number,
      openIssueCount: githubMilestone.open_issues,
      open: githubMilestone.state === "open"
    };
  }
  return result;
}

export function getSprintMilestoneName(sprintNumber: number): string {
  return `Sprint-${sprintNumber}`;
}

/**
 * Ensure that the provided date string contains a timezone offset.
 * @param date The date string.
 * @returns The date string with a timezone offset (if it didn't already have one).
 */
function addOffset(date: string): string {
  if (date) {
    if (!date.includes("T")) {
      const now = new Date();
      const totalOffsetInMinutes: number = now.getTimezoneOffset();
      const offsetHours: string = Math.floor(totalOffsetInMinutes / 60).toString().padStart(2, "0");
      const offsetMinutes: string = (totalOffsetInMinutes % 60).toString().padStart(2, "0");
      date += `T${offsetHours}:${offsetMinutes}:00`;
    }
    if (!date.endsWith("Z")) {
      date += "Z";
    }
  }
  return date;
}

/**
 * Get the GitHubRepository object from the provided repository URL.
 * @param repositoryUrl The repository URL to get the GitHubRepository object from.
 */
export function getGitHubRepositoryFromUrl(repositoryUrl: string): GitHubRepository | undefined {
  let result: GitHubRepository | undefined;
  const repositoryUrlBuilder: URLBuilder = URLBuilder.parse(repositoryUrl);
  const host: string | undefined = repositoryUrlBuilder.getHost();
  const path: string | undefined = repositoryUrlBuilder.getPath();
  if (host === "github.com" && path) {
    let organization: string;
    let name: string;
    const pathFirstSlashIndex: number = path.indexOf("/", 1);
    if (pathFirstSlashIndex === -1) {
      organization = "";
      name = path.substring(1);
    } else {
      organization = path.substring(1, pathFirstSlashIndex);
      const pathSecondSlashIndex: number = path.indexOf("/", pathFirstSlashIndex + 1);
      if (pathSecondSlashIndex === -1) {
        name = path.substring(pathFirstSlashIndex + 1);
      } else {
        name = path.substring(pathFirstSlashIndex + 1, pathSecondSlashIndex);
      }

      if (!name || name === "blob") {
        name = organization;
        organization = "";
      }
    }

    if (name.endsWith(".git")) {
      name = name.substring(0, name.length - ".git".length);
    }

    if (name) {
      result = {
        organization,
        name
      };
    }
  }
  return result;
}
