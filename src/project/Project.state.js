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
 *  Project.state.js
 *  Redux-based state-management code.
 */

import { UserState } from '../app-state';
import { API_ERRORS } from '../api-client';
import { StateModel} from '../model/Model';
import { projectSchema } from '../model/RenkuModels';
import { SpecialPropVal } from '../model/Model'
import { isNullOrUndefined } from 'util';


const GraphIndexingStatus = {
  NO_WEBHOOK: -2,
  NO_PROGRESS: -1,
  MIN_VALUE: 0,
  MAX_VALUE: 100
};

export const PollingInterval = {
  START: 3000,
  READY: 60000
}

class ProjectModel extends StateModel {
  constructor(stateBinding, stateHolder, initialState) {
    super(projectSchema, stateBinding, stateHolder, initialState)
  }

  stopCheckingWebhook() {
    this.set('webhook.stop', true);
  }

  fetchGraphWebhook(client, id, user) {
    if (user == null) {
      this.set('webhook.possible', false);
    }
    const userIsOwner = this.get('core.owner.id') === user.id;
    this.set('webhook.possible', userIsOwner);
    if (userIsOwner) {
      this.fetchGraphWebhookStatus(client, id);
    }
  }

  fetchGraphStatus(client, id) {
    return client.checkGraphStatus(id)
      .then((resp) => {
        let progress;
        if (resp.progress == null) {
          progress = GraphIndexingStatus.NO_PROGRESS;
        }
        if (resp.progress === 0 || resp.progress) {
          progress = resp.progress;
        }
        this.set('webhook.progress', progress);
        return progress;
      })
      .catch((err) => {
        if (err.case === API_ERRORS.notFoundError) {
          const progress = GraphIndexingStatus.NO_WEBHOOK;
          this.set('webhook.progress', progress);
          return progress;
        }
        else {
          throw err;
        }
      });
  }

  fetchGraphWebhookStatus(client, id) {
    this.set('webhook.created', false);
    this.setUpdating({webhook: {status: true}});
    return client.checkGraphWebhook(id)
      .then((resp) => {
        this.set('webhook.status', resp);
      })
      .catch((err) => {
        this.set('webhook.status', err);
      });
  }

  createGraphWebhook(client, id) {
    this.setUpdating({webhook: {created: true}});
    return client.createGraphWebhook(id)
      .then((resp) => {
        this.set('webhook.created', resp);
      })
      .catch((err) => {
        this.set('webhook.created', err);
      });
  }

  // TODO: Do we really want to re-fetch the entire project on every change?
  fetchProject(client, id) {
    this.setUpdating({core: {available: true}});
    return client.getProject(id, {statistics: true})
      .then(resp => resp.data)
      .then(d => {
        const updatedState = {
          core: { ...d.metadata.core, available: true },
          system: d.metadata.system,
          visibility: d.metadata.visibility,
          statistics: d.metadata.statistics
        };
        this.setObject(updatedState);
        return d;
      })
      .catch(err => {
        if (err.case === API_ERRORS.notFoundError) {
          this.set('core.available', false);
        }
        else throw err;
      });
  }

  initialFetchProjectFilesTree(client, id, openFilePath , openFolder ){
    this.setUpdating({transient:{requests:{filesTree: true}}});
    return client.getProjectFilesTree(id, openFilePath)
      .then(d => {
        const updatedState = { filesTree: d, transient:{requests:{filesTree: false}} };
        this.setObject(updatedState);
        this.set('filesTree', d);
        return d;
      })
      .then(d=> {
        return this.returnTreeOrFetchNext(client, id, openFilePath, openFolder, d)
      });
  }

  deepFetchProjectFilesTree(client, id, openFilePath, openFolder, oldTree){
    this.setUpdating({transient:{requests:{filesTree: true}}});
    return client.getProjectFilesTree(id, openFilePath, openFolder, oldTree.lfsFiles)
      .then(d => {
        const updatedState = this.insertInParentTree(oldTree, d, openFolder);
        this.setObject(updatedState);
        this.set('filesTree', oldTree);
        return oldTree;
      }).then(d=> {
        return this.returnTreeOrFetchNext(client, id, openFilePath, openFolder, d)
      });
  }

  returnTreeOrFetchNext(client, id, openFilePath, openFolder, tree){
    if(openFilePath !== undefined && openFilePath.split('/').length > 1){
      const openFilePathArray = openFilePath.split('/');
      const goto = openFolder !== undefined ?  
        openFolder + "/" +openFilePathArray[0] 
        : openFilePathArray[0];
      return this.fetchProjectFilesTree(client, id, openFilePath.replace(openFilePathArray[0],''), goto);
    } else {
      return tree;
    } 
  }

  cleanFilePathUrl(openFilePath){
    if(openFilePath.startsWith('/'))
      return openFilePath = openFilePath.substring(1);
    else return openFilePath;
  }

  insertInParentTree(parentTree, newTree , openFolder){
    parentTree.hash[openFolder].treeRef.children=newTree.tree;
    parentTree.hash[openFolder].childrenLoaded=true;
    parentTree.hash[openFolder].childrenOpen = true;
    for (const node in newTree.hash) 
      parentTree.hash[node] = newTree.hash[node];
    return { filesTree: parentTree, transient:{requests:{filesTree: false}} };
  }

  fetchProjectFilesTree(client, id, openFilePath, openFolder){
    if (this.get('transient.requests.filesTree') === SpecialPropVal.UPDATING) return;
    const oldTree = this.get('filesTree');
    openFilePath = this.cleanFilePathUrl(openFilePath);
    if(isNullOrUndefined(oldTree)){
      return this.initialFetchProjectFilesTree(client, id, openFilePath , openFolder);
    } else {
      if(openFolder !== undefined && oldTree.hash[openFolder].childrenLoaded === false) {
        return this.deepFetchProjectFilesTree(client, id, openFilePath , openFolder, oldTree)
      } else {
        return oldTree;
      }
    }
  }

  setProjectOpenFolder(client, id, folderPath){
    let filesTree = this.get('filesTree');
    if (filesTree.hash[folderPath].childrenLoaded === false){
      this.fetchProjectFilesTree(client,id,"",folderPath);
    }
    filesTree.hash[folderPath].childrenOpen = !filesTree.hash[folderPath].childrenOpen;
    this.set('filesTree',filesTree);
  } 

  makeNotebookServerPollingStart(client,id,interval){
    this.set('notebooks.pollingInterval', interval);
    const newPoller = setInterval(() => {
      return this.fetchNotebookServers(client, id);
    }, interval);
    this.set('notebooks.polling', newPoller);

    // invoke immediatly the first time
    return this.fetchNotebookServers(client, id, true);
  }

  startNotebookServersPolling(client, id, interval) {
    const oldPoller = this.get('notebooks.polling');
    const oldInterval = this.get('notebooks.pollingInterval');
    if (oldPoller == null) {
      this.set('notebooks.pollingInterval', interval);
      return this.makeNotebookServerPollingStart(client,id,interval);
    } else {
      if(oldInterval !== undefined && oldInterval !== interval){
        return this.changeNotebookServerPollingInterval(client,id,interval);
      }
    }
  }

  changeNotebookServerPollingInterval(client, id, newInterval){
    this.stopNotebookServersPolling();
    this.set('notebooks.pollingInterval', newInterval);
    return this.makeNotebookServerPollingStart(client,id,newInterval);
  }

  stopNotebookServersPolling() {
    const poller = this.get('notebooks.polling');
    if (poller) {
      this.set('notebooks.polling', null);
      this.set('notebooks.pollingInterval', null);
      clearTimeout(poller);
    }
  }

  fetchNotebookServers(client, id, first) {
    if(this.get('notebooks.all')=== SpecialPropVal.UPDATING) return;
    if (first)  this.setUpdating({notebooks: {all: true}});
    return client.getNotebookServers(id)
      .then(resp => {
        const serverNames = Object.keys(resp.data).sort();
        if(serverNames && serverNames.length > 0){
          const allServersReady = serverNames.map((k, i) =>
            resp.data[k].ready
          ).filter(ready => ready === false).length === 0;
          if(allServersReady && this.get('notebooks.pollingInterval')!== PollingInterval.READY){
            this.changeNotebookServerPollingInterval(client, id, PollingInterval.READY);
          } else if(!allServersReady && this.get('notebooks.pollingInterval') !== PollingInterval.START){
            this.changeNotebookServerPollingInterval(client, id, PollingInterval.START);
          }
        } else {
          this.stopNotebookServersPolling();
        }
        // TODO: filter for current project
        this.set('notebooks.all', resp.data);
      });
  }

  stopNotebookServer(client, serverName) {
    // manually set the state instead of waiting for the promise to resolve
    const updatedState = {
      notebooks: {
        all: {
          [serverName]: {
            ready: false,
            pending: "stop"
          }
        }
      }
    }
    this.setObject(updatedState);
    return client.stopNotebookServer(serverName);
  }

  fetchNotebookServerUrl(client, id) {
    const pathWithNamespace = this.get('core.path_with_namespace');
    client.getNotebookServerUrl(id, pathWithNamespace)
      .then(urls => {
        this.set('core.notebookServerUrl', urls.notebookServerUrl);
        this.set('core.notebookServerAPI', urls.notebookServerAPI);
      });
  }

  fetchModifiedFiles(client, id) {
    client.getModifiedFiles(id)
      .then(d => {
        this.set('files.modifiedFiles', d)
      })
  }

  fetchMergeRequests(client, id) {
    this.setUpdating({system: {merge_requests: true}});
    client.getMergeRequests(id)
      .then(resp => resp.data)
      .then(d => {
        this.set('system.merge_requests', d)
      })
  }

  fetchBranches(client, id) {
    this.setUpdating({system: {branches: true}});
    client.getBranches(id)
      .then(resp => resp.data)
      .then(d => {
        this.set('system.branches', d)
      })
  }

  fetchReadme(client, id) {
    // Do not fetch if a fetch is in progress
    if (this.get('transient.requests.readme') === SpecialPropVal.UPDATING) return;

    this.setUpdating({transient:{requests:{readme: true}}});
    client.getProjectReadme(id)
      .then(d => this.set('data.readme.text', d.text))
      .catch(error => {
        if (error.case === API_ERRORS.notFoundError) {
          this.set('data.readme.text', 'No readme file found.')
        }
      })
      .finally(() => this.set('transient.requests.readme', false))
  }

  setTags(client, id, name, tags) {
    this.setUpdating({system: {tag_list: [true]}});
    client.setTags(id, name, tags).then(() => {
      this.fetchProject(client, id);
    })
  }

  setDescription(client, id, name, description) {
    this.setUpdating({core: {description: true}});
    client.setDescription(id, name, description).then(() => {
      this.fetchProject(client, id);
    })
  }

  star(client, id, userStateDispatch, starred) {
    client.starProject(id, starred).then(() => {
      // TODO: Bad naming here - will be resolved once the user state is re-implemented.
      this.fetchProject(client, id).then(p => userStateDispatch(UserState.star(p.metadata.core)))

    })
  }

  fetchCIJobs(client, id) {
    this.setUpdating({system: {ci_jobs: true}});
    client.getJobs(id)
      .then(resp => resp.data)
      .then((d) => {
        this.set('system.ci_jobs', d)
      })
      .catch((error) => this.set('system.ci_jobs', []));
  }
}

export { ProjectModel, GraphIndexingStatus };
