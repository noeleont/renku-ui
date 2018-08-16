/*!
 * Copyright 2017 - Swiss Data Science Center (SDSC)
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
 *  incubator-renku-ui
 *
 *  Project.js
 *  Container components for project.
 */

import React, { Component } from 'react';
import { Provider, connect } from 'react-redux'

import { StateKind, StateModel } from '../model/Model';
// TODO: ONLY use one projectSchema after the refactoring has been finished.
import { newProjectSchema } from '../model/RenkuModels';
import { createStore } from '../utils/EnhancedState'
import { slugFromTitle } from '../utils/HelperFunctions';
import Present from './Project.present'
import State from './Project.state'
import { ProjectModel } from './Project.state'
import Ku from '../ku/Ku'
import Notebook from '../file/Notebook'
import { FileLineage, LaunchNotebookServerButton } from '../file'
import { ACCESS_LEVELS } from '../gitlab';
import { alertError } from '../utils/Errors';
import { MergeRequest, MergeRequestList } from '../merge-request';

class New extends Component {
  constructor(props) {
    super(props);
    this.newProject = new StateModel(newProjectSchema, StateKind.REDUX);
    this.handlers = {
      onSubmit: this.onSubmit.bind(this),
      onTitleChange: this.onTitleChange.bind(this),
      onDescriptionChange: this.onDescriptionChange.bind(this),
      onVisibilityChange: this.onVisibilityChange.bind(this),
    };
  }

  onSubmit = () => {
    const validation = this.newProject.validate()
    if (validation.result) {
      this.props.client.postProject(this.newProject.get()).then((project) => {
        this.props.history.push(`/projects/${project.id}`);
      })
    }
    else {
      // This should be done by proper form validation.
      console.error('Can not create new project - insufficient information: ', validation.errors)
    }
  };
  onTitleChange = (e) => {
    this.newProject.set('display.title', e.target.value);
    this.newProject.set('display.slug', slugFromTitle(e.target.value));
  };
  onDescriptionChange = (e) => { this.newProject.set('display.description', e.target.value) };
  onVisibilityChange = (e) => { this.newProject.set('meta.visibility', e.target.value) };
  // onDataReferenceChange = (key, e) => { this.newProject.setObject('reference', key, e.target.value) };

  render() {
    const ConnectedNewProject = connect(this.newProject.mapStateToProps)(Present.ProjectNew);
    return <ConnectedNewProject handlers={this.handlers} store={this.newProject.reduxStore}/>;
  }
}


// TODO: This component has grown too much and needs restructuring. One option would be to insert
// TODO: another container component between this top-level project component and the presentational
// TODO: component displaying the project overview.
class View extends Component {
  constructor(props) {
    super(props);
    this.projectState = new ProjectModel(StateKind.REDUX);
  }

  componentDidMount() {
    this.fetchAll()
  }

  fetchAll() {
    this.projectState.fetchProject(this.props.client, this.props.id);
    this.projectState.fetchReadme(this.props.client, this.props.id);
    this.projectState.fetchModifiedFiles(this.props.client, this.props.id);
    this.projectState.fetchMergeRequests(this.props.client, this.props.id);
    this.projectState.fetchBranches(this.props.client, this.props.id);
    this.projectState.fetchCIJobs(this.props.client, this.props.id);
  }

  getStarred(user, projectId) {
    if (user && user.starredProjects) {
      return user.starredProjects.map((project) => project.id).indexOf(projectId) >= 0
    }
  }

  subUrls() {
    // For exact matches, we strip the trailing / from the baseUrl
    const match = this.props.match;
    const baseUrl = match.isExact ? match.url.slice(0, -1) : match.url;
    const filesUrl = `${baseUrl}/files`;
    const fileContentUrl = `${filesUrl}/blob`;

    return {
      overviewUrl: `${baseUrl}/`,
      kusUrl: `${baseUrl}/kus`,
      kuNewUrl: `${baseUrl}/ku_new`,
      kuUrl: `${baseUrl}/kus/:kuIid(\\d+)`,
      filesUrl: `${filesUrl}`,
      fileContentUrl: `${fileContentUrl}`,
      lineagesUrl: `${filesUrl}/lineage`,
      lineageUrl: `${filesUrl}/lineage/:filePath+`,
      notebooksUrl: `${filesUrl}/notebooks`,
      notebookUrl: `${fileContentUrl}/:filePath([^.]+.ipynb)`,
      dataUrl: `${filesUrl}/data`,
      workflowsUrl: `${filesUrl}/workflows`,
      settingsUrl: `${baseUrl}/settings`,
      mrOverviewUrl: `${baseUrl}/pending`,
      mrUrl: `${baseUrl}/pending/:mrIid`,
    }
  }

  // TODO: Fix for MRs across forks.
  getMrSuggestions() {

    // Don't display any suggestions while the state is updating - leads to annoying flashing fo
    // wrong information while branches are there but merge_requests are not...
    if (this.projectState.get('system.merge_requests') === this.projectState._updatingPropVal) return [];
    if (this.projectState.get('system.branches') === this.projectState._updatingPropVal) return [];

    const mergeRequestBranches = this.projectState.get('system.merge_requests')
      .map(mr => mr.source_branch);

    return this.projectState.get('system.branches')
      .filter(branch => branch.name !== 'master')
      .filter(branch => !branch.merged)
      .filter(branch => mergeRequestBranches.indexOf(branch.name) < 0);
  }

  getImageBuildStatus() {
    const ciJobs = this.projectState.get('system.ci_jobs');

    // We don't want to flash an alert while the state is updating.
    if (ciJobs === this.projectState._updatingPropVal) return;

    const buildJobs = ciJobs
      .filter((job) => job.name === 'image_build')
      .sort((job1, job2) => job1.created_at > job2.created_at ? -1 : 1);

    if (buildJobs.length === 0) {
      return;
    }
    else {
      return buildJobs[0]
    }
  }

  subComponents(projectId, ownProps) {
    const accessLevel = this.projectState.get('visibility.accessLevel');
    const externalUrl = this.projectState.get('core.external_url');
    const updateProjectView = this.forceUpdate.bind(this);
    const notebookServerUrl = this.projectState.get('core.notebookServerUrl');

    // Access to the project state could be given to the subComponents by connecting them here to
    // the projectStore. This is not yet necessary.
    const subProps = {...ownProps, projectId, accessLevel, externalUrl, notebookServerUrl};

    const mergeRequests = this.projectState.get('system.merge_requests');

    const mapStateToProps = (state, ownProps) => {
      return {
        mergeRequests: mergeRequests === this.projectState._updatingPropVal ? [] : mergeRequests,
        externalMROverviewUrl: `${externalUrl}/merge_requests`,
        ...ownProps
      };
    };
    const ConnectedMergeRequestList = connect(mapStateToProps)(MergeRequestList);

    return {
      kuList: <Ku.List key="kus" {...subProps} urlMap={this.subUrls()} />,

      kuView: (p) => <Ku.View key="ku" {...subProps}
        kuIid={p.match.params.kuIid}
        updateProjectView={updateProjectView}
        projectPath={this.projectState.get('core.path_with_namespace')}/>,
      /* TODO Should we handle each type of file or just have a generic project files viewer? */

      notebookView: (p) => <Notebook.Show key="notebook" {...subProps}
        filePath={p.match.params.filePath}
        projectPath={this.projectState.get('core.path_with_namespace')}/>,

      lineageView: (p) => <FileLineage key="lineage" {...subProps}
        externalUrl={externalUrl}
        path={p.match.params.filePath} />,

      launchNotebookServerButton: <LaunchNotebookServerButton key= "launch notebook" {...subProps}
        notebookServerUrl={this.projectState.get('core.notebookServerUrl')}/>,

      mrList: <ConnectedMergeRequestList key="mrList" store={this.projectState.reduxStore}
        mrOverviewUrl={this.subUrls().mrOverviewUrl}/>,
      mrView: (p) => <MergeRequest
        key="mr" {...subProps}
        iid={p.match.params.mrIid}
        updateProjectState={this.fetchAll.bind(this)}/>,
    }
  }

  eventHandlers = {
    onProjectTagsChange: (tags) => {
      const core = this.projectState.get('core');
      this.projectState.setTags(this.props.client, core.id, core.title, tags);
    },
    onProjectDescriptionChange: (description) => {
      const core = this.projectState.get('core');
      this.projectState.setDescription(this.props.client, core.id, core.title, description);
    },
    onStar: (e) => {
      e.preventDefault();
      const user = this.props.user;
      if (!(user && user.id != null)) {
        alertError('Please login to star a project.');
        return;
      }
      const projectId = this.projectState.get('core.id') || parseInt(this.props.match.params.id, 10);
      const starred = this.getStarred(this.props.user, projectId);
      this.projectState.star(this.props.client, projectId, this.props.userStateDispatch, starred)
    },
    onCreateMergeRequest: (branch) => {
      const core = this.projectState.get('core');
      let newMRiid;
      // TODO: Again, it would be nice to update the local state rather than relying on the server
      // TODO: updating the information fast enough through all possible layers of caches, etc...
      this.props.client.createMergeRequest(core.id, branch.name, branch.name, 'master')
        .then((d) => {
          newMRiid = d.iid;
          return this.fetchAll()
        })
        .then(() => this.props.history.push(`${this.subUrls().mrOverviewUrl}/${newMRiid}`))
    },
    onProjectRefresh: (e) => {
      e.preventDefault();
      this.fetchAll()
    }
  };

  mapStateToProps(state, ownProps) {
    const internalId = this.projectState.get('core.id') || parseInt(ownProps.match.params.id, 10);
    const starred = this.getStarred(ownProps.user, internalId);
    const settingsReadOnly = state.visibility.accessLevel < ACCESS_LEVELS.MAINTAINER;
    const suggestedMRBranches = this.getMrSuggestions();
    const externalUrl = this.projectState.get('core.external_url');
    const canCreateMR = state.visibility.accessLevel >= ACCESS_LEVELS.DEVELOPER;
    const imageBuild = this.getImageBuildStatus();

    return {
      ...this.projectState.get(),
      ...ownProps,
      ...this.subUrls(),
      ...this.subComponents.bind(this)(internalId, ownProps),
      starred,
      settingsReadOnly,
      suggestedMRBranches,
      externalUrl,
      canCreateMR,
      imageBuild
    }
  }

  render() {
    const ConnectedProjectView = connect(
      this.mapStateToProps.bind(this), null, null, {storeKey: 'projectStore'}
    )(Present.ProjectView);
    const props = {...this.props, ...this.eventHandlers, projectStore: this.projectState.reduxStore};
    return <ConnectedProjectView {...props} />

  }
}


class List extends Component {
  constructor(props) {
    super(props);
    this.store = createStore(State.List.reducer, 'project list');
  }

  urlMap() {
    return {
      projectsUrl: '/projects',
      projectNewUrl: '/project_new'
    }
  }

  componentDidMount() {
    this.listProjects();
  }

  listProjects() {
    this.store.dispatch(State.List.fetch(this.props.client));
  }

  mapStateToProps(state, ownProps) { return ({...{user: ownProps.user}, ...state, ...ownProps }) }

  render() {
    const VisibleProjectList = connect(this.mapStateToProps)(Present.ProjectList);
    return [
      <Provider key="list" store={this.store}>
        <VisibleProjectList urlMap={this.urlMap()} {...this.props} />
      </Provider>
    ]
  }
}

export default { New, View, List };
