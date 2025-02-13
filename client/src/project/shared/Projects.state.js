/*!
 * Copyright 2020 - Swiss Data Science Center (SDSC)
 * A partnership between École Polytechnique Fédérale de Lausanne (EPFL) and
 * Eidgenössische Technische Hochschule Zürich (ETHZ).
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS, WITHOUT
 * WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/**
 *  renku-ui
 *
 *  Projects.state.js
 *  Projects controller code.
 */

import { ACCESS_LEVELS } from "../../api-client";


class ProjectsCoordinator {
  constructor(client, model) {
    this.client = client;
    this.model = model;
  }

  _starredProjectMetadata(project) {
    let accessLevel = 0;
    // check permissions from v4 API
    if (project?.permissions) {
      if (project?.permissions?.project_access)
        accessLevel = Math.max(accessLevel, project.permissions.project_access.access_level);
      if (project?.permissions?.group_access)
        accessLevel = Math.max(accessLevel, project.permissions.group_access.access_level);
    }
    // check permissions from GraphQL -- // ? REF: https://docs.gitlab.com/ee/user/permissions.html
    else if (project?.userPermissions) {
      if (project.userPermissions.removeProject)
        accessLevel = Math.max(accessLevel, ACCESS_LEVELS.OWNER);
      else if (project.userPermissions.adminProject)
        accessLevel = Math.max(accessLevel, ACCESS_LEVELS.MAINTAINER);
      else if (project.userPermissions.pushCode)
        accessLevel = Math.max(accessLevel, ACCESS_LEVELS.DEVELOPER);
    }

    // Project id can be a number e.g. 1234 or a string with the format: gid://gitlab/Project/1234
    const projectFullId = typeof (project.id) === "number" ? [] : project.id.split("/");
    const projectId = projectFullId.length > 1 ? projectFullId[projectFullId.length - 1] : project.id;

    return {
      id: projectId,
      name: project.name,
      path_with_namespace: project.path_with_namespace ?? project?.fullPath,
      description: project.description,
      tag_list: project.tag_list,
      star_count: project.star_count,
      owner: project.owner,
      last_activity_at: project.last_activity_at,
      access_level: accessLevel,
      http_url_to_repo: project.http_url_to_repo ? project.http_url_to_repo : project.httpUrlToRepo,
      namespace: project.namespace,
      path: project.path,
      avatar_url: project.avatar_url,
      visibility: project.visibility
    };
  }

  async getFeatured() {
    if (this.model.get("featured.fetching"))
      return;
    // set status to fetching, get all the projects and filter and invoke both APIs
    this.model.set("featured.fetching", true);
    const params = { query: "last_activity_at", per_page: 100 };
    const promiseStarred = this.client.getAllProjects({ ...params, starred: true })
      .then(resp => resp.map((project) => this._starredProjectMetadata(project)))
      .catch(() => []);

    const promiseMember = this.client.getAllProjectsGraphQL(params)
      .then(resp => {
        return resp.map((project) => this._starredProjectMetadata(project));
      })
      .catch(() => []);


    // set `featured` content and return only `starred` and `member` projects data
    return Promise.all([promiseStarred, promiseMember]).then(values => {
      this.model.setObject({
        featured: {
          starred: { $set: values[0] },
          member: { $set: values[1] },
          fetched: new Date(),
          fetching: false
        }
      });
      return { starred: values[0], member: values[1] };
    });
  }

  _setLandingProjects(projectList, lastVisited) {
    this.model.setObject({
      landingProjects: {
        fetched: new Date(),
        fetching: false,
        list: { $set: projectList },
        lastVisited,
      }
    });
  }

  async _getOwnProjectsForLanding() {
    let projectList = [];
    const params = { order_by: "last_activity_at", per_page: 5, membership: true };
    const landingProjects = await this.client.getProjects({ ...params });
    projectList = landingProjects?.data?.map((project) => this._starredProjectMetadata(project)) ?? [];
    this._setLandingProjects(projectList, false);
  }

  async getLanding() {
    if (this.model.get("landingProjects.fetching"))
      return;
    // set status to fetching, get the projects for the landing page
    this.model.set("landingProjects.fetching", true);
    try {
      const lastProjects = await this.client.getRecentProjects(4);
      const lastProjectsVisited = lastProjects?.data?.projects;
      let projectList = [];
      if (lastProjectsVisited?.length > 0) {
        // if the user has recent projects get the project information
        const projectRequests = [];
        for (const project of lastProjectsVisited)
          projectRequests.push(this.client.getProject(project, { doNotTrack: true }));

        Promise.allSettled(projectRequests).then( results => {
          for (const result of results) {
            if (result?.status === "fulfilled" && result?.value?.data?.all)
              projectList.push(this._starredProjectMetadata(result?.value?.data.all));
          }

          // if couldn't get any project of the list
          if (!projectList.length)
            this._getOwnProjectsForLanding();

          // set projects
          this._setLandingProjects(projectList, true);
        }).catch( () => {
          this.model.set("landingProjects.fetching", false);
        });
      }
      else {
        // in case there is not records in the last projects list bring user projects
        this._getOwnProjectsForLanding();
      }
    }
    catch {
      this.model.set("landingProjects.fetching", false);
      return { landing: [] };
    }
  }

  updateStarred(project, isStarred) {
    const starred = this.model.get("featured.starred");
    let newStarred;
    if (isStarred) {
      newStarred = [...starred, this._starredProjectMetadata(project)];
    }
    else {
      const indexToRemove = starred.map(project => project.id).indexOf(project.id);
      newStarred = [
        ...starred.slice(0, indexToRemove),
        ...starred.slice(indexToRemove + 1)
      ];
    }
    this.model.set("featured.starred", newStarred);
    return newStarred;
  }

  async getNamespaces() {
    if (this.model.get("namespaces.fetching"))
      return;
    this.model.set("namespaces.fetching", true);
    return this.client.getNamespaces()
      .then((response) => {
        this.model.setObject({
          namespaces: {
            list: { $set: response.data },
            fetched: new Date(),
            fetching: false
          }
        });
        return response.data;
      })
      .catch((error) => {
        this.model.setObject({
          namespaces: {
            list: { $set: [] },
            fetched: null,
            fetching: false
          }
        });
        throw error;
      });
  }

  async getVisibilities(namespace, projectVisibility) {
    const computeVisibilities = (options) => {
      if (options.includes("private")) {
        return {
          visibilities: ["private"],
          default: "private",
        };
      }
      else if (options.includes("internal")) {
        return {
          visibilities: ["private", "internal"],
          default: "internal",
        };
      }
      return {
        visibilities: ["private", "internal", "public"],
        default: "public"
      };
    };

    let availableVisibilities = null;
    let options = projectVisibility ? [projectVisibility] : [];
    if (!namespace)
      return null;

    if (namespace?.kind === "user") {
      options.push("public");
      return computeVisibilities(options);
    }
    else if (namespace?.kind === "group") {
      // get group visibility
      const group = await this.client.getGroupByPath(namespace.full_path).then(r => r.data);
      options.push(group.visibility);
      return computeVisibilities(options);
    }
    return availableVisibilities;
  }
}

export { ProjectsCoordinator };
