/*!
 * Copyright 2022 - Swiss Data Science Center (SDSC)
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

import { FixturesConstructor } from "./fixtures";

/**
 * Fixtures for Projects
 */

function Projects<T extends FixturesConstructor>(Parent: T) {
  return class ProjectsFixtures extends Parent {
    landingUserProjects(name = "getLandingUserProjects") {
      cy.intercept("/ui-server/api/graphql", {
        fixture: "landing-user-projects.json"
      }).as(name);
      return this;
    }

    projects(name = "getProjects") {
      cy.intercept(
        "/ui-server/api/projects?query=last_activity_at&per_page=100&starred=true&page=1",
        {
          fixture: "projects.json"
        }
      ).as(name);
      return this;
    }

    interceptMigrationCheck(name, fixture) {
      const coreUrl = "/ui-server/api/renku/cache.migrations_check";
      const params =
        "git_url=https%3A%2F%2Fdev.renku.ch%2Fgitlab%2Fe2e%2Flocal-test-project.git&branch=master";
      cy.intercept(`${coreUrl}?${params}`, {
        fixture: fixture
      }).as(name);
      return this;
    }

    projectMigrationUpToDate(name = "getMigration") {
      this.interceptMigrationCheck(
        name,
        "test-project_migration_up-to-date.json"
      );
      return this;
    }

    projectMigrationOptional(name = "getMigration") {
      this.interceptMigrationCheck(
        name,
        "test-project_migration_update-optional.json"
      );
      return this;
    }

    projectMigrationRecommended(name = "getMigration") {
      this.interceptMigrationCheck(
        name,
        "test-project_migration_update-recommended.json"
      );
      return this;
    }

    projectMigrationRequired(name = "getMigration") {
      this.interceptMigrationCheck(
        name,
        "test-project_migration_update-required.json"
      );
      return this;
    }

    projectTestContents(
      names = {
        coreServiceVersionName: "getCoreServiceVersion",
        coreService8VersionName: "getCoreService8Version",
        projectBranchesName: "getProjectBranches",
        projectCommitsName: "getProjectCommits",
        projectReadmeCommits: "getProjectReadmeCommits",
        readmeName: "getReadme",
        validationName: "getValidation"
      }
    ) {
      const {
        coreServiceVersionName,
        coreService8VersionName,
        projectBranchesName,
        projectCommitsName,
        readmeName
      } = names;
      const { projectReadmeCommits, validationName } = names;
      cy.intercept(
        "/ui-server/api/projects/39646/repository/files/README.md/raw?ref=master",
        { fixture: "test-project-readme.md" }
      ).as(readmeName);
      cy.intercept(
        "/ui-server/api/projects/39646/repository/commits?ref_name=master&per_page=2&path=README.md&page=1",
        { fixture: "test-project-readme-commits.json" }
      ).as(projectReadmeCommits);
      cy.intercept(
        "/ui-server/api/projects/39646/repository/commits?ref_name=master&per_page=100&page=1",
        { fixture: "test-project-commits.json" }
      ).as(projectCommitsName);
      cy.intercept(
        "/ui-server/api/projects/39646/repository/branches?per_page=100&page=1",
        { fixture: "test-project-branches.json" }
      ).as(projectBranchesName);
      cy.intercept("/ui-server/api/projects/39646/graph/webhooks/validation", {
        body: { message: "Hook valid" }
      }).as(validationName);
      cy.intercept("/ui-server/api/projects/39646/graph/status", {
        body: { done: 1, total: 1, progress: 100.0 }
      });
      cy.intercept("/ui-server/api/renku/8/version", {
        body: {
          result: {
            latest_version: "0.16.2",
            supported_project_version: 8.0
          }
        }
      }).as(coreService8VersionName);
      cy.intercept("/ui-server/api/renku/9/version", {
        body: {
          result: {
            latest_version: "1.0.4",
            supported_project_version: 9.0
          }
        }
      }).as(coreServiceVersionName);
      return this;
    }

    projectTest(
      names = {
        coreServiceVersionName: "getCoreServiceVersion",
        coreService8VersionName: "getCoreService8Version",
        projectBranchesName: "getProjectBranches",
        projectCommitsName: "getProjectCommits",
        projectName: "getProject",
        projectReadmeCommits: "getProjectReadmeCommits",
        readmeName: "getReadme",
        validationName: "getValidation"
      }
    ) {
      const { projectName } = names;
      cy.intercept(
        "/ui-server/api/projects/e2e%2Flocal-test-project?statistics=true",
        {
          fixture: "test-project.json"
        }
      ).as(projectName);
      return this.projectTestContents(names);
    }

    projectTestObserver(
      names = {
        coreServiceVersionName: "getCoreServiceVersion",
        coreService8VersionName: "getCoreService8Version",
        projectBranchesName: "getProjectBranches",
        projectCommitsName: "getProjectCommits",
        projectName: "getProject",
        projectReadmeCommits: "getProjectReadmeCommits",
        readmeName: "getReadme",
        validationName: "getValidation"
      }
    ) {
      const { projectName } = names;
      cy.fixture("test-project.json").then((project) => {
        project.permissions.project_access.access_level = 10;
        cy.intercept(
          "GET",
          "/ui-server/api/projects/e2e%2Flocal-test-project?statistics=true",
          project
        ).as(projectName);
      });
      return this.projectTestContents(names);
    }
  };
}

export { Projects };
