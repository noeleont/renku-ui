/*!
 * Copyright 2019 - Swiss Data Science Center (SDSC)
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
 *  Files.test.js
 *  Tests for file components.
 */

import React from "react";
import ReactDOM from "react-dom";
import { MemoryRouter } from "react-router-dom";

import { testClient as client } from "../api-client";
import { generateFakeUser } from "../user/User.test";
import { ShowFile, JupyterButton, FilePreview } from "./index";
import { StateModel, globalSchema } from "../model";
import { NotebookSourceDisplayMode, sanitizeNotebook, tweakCellMetadata } from "./File.present";
import "jest-canvas-mock";

const model = new StateModel(globalSchema);

function notebookCellOutputsMatch(modified, original, shouldNotMatch) {
  modified.outputs?.forEach((o, j) => {
    const oo = original.outputs[j];
    let expectation = expect(o.data["text/html"]);
    if (shouldNotMatch) expectation.not.toEqual(oo.data["text/html"]);
    else expectation.toEqual(oo.data["text/html"]);
  });
}

describe("rendering", () => {
  const users = [
    { type: "anonymous", data: generateFakeUser(true) },
    { type: "logged", data: generateFakeUser() }
  ];

  const props = {
    client,
    model,
    filePath: "/projects/1/files/blob/myFolder/myNotebook.ipynb",
    match: { url: "/projects/1", params: { id: "1" } },
    launchNotebookUrl: "/projects/1/launchNotebook",
    params: { PREVIEW_THRESHOLD: { soft: 1048576, hard: 10485760 } }
  };

  const file = {
    image: {
      file_name: "image.jpeg",
      content: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="
    },
    text: {
      file_name: "text.csv",
      content: "Q291bnRyeSwxOTkwLDE5OTBfbG93ZXIsIDE5OTBfdXBwZXIsMT"
    },
    code: {
      file_name: "text.py",
      content: "Q291bnRyeSwxOTkwLDE5OTBfbG93ZXIsIDE5OTBfdXBwZXIsMT"
    },
    markdown: {
      file_name: "markdown.md",
      content: "Q291bnRyeSwxOTkwLDE5OTBfbG93ZXIsIDE5OTBfdXBwZXIsMT"
    },
    noExtension: {
      file_name: "noExtension",
      content: "Q291bnRyeSwxOTkwLDE5OTBfbG93ZXIsIDE5OTBfdXBwZXIsMT"
    },
    noPreview: {
      file_name: "no_preview.unknown"
    },
    lfs: {
      file_name: "doesNotMatter",
      // eslint-disable-next-line
      content: "dmVyc2lvbiBodHRwczovL2dpdC1sZnMuZ2l0aHViLmNvbS9zcGVjL3YxCm9pZCBzaGEyNTY6NGMzYjM5Mj"
    },
    sizeBig: {
      file_name: "doesNotMatter",
      size: 1024 * 1024 * 2
    },
    sizeTooBig: {
      file_name: "doesNotMatter",
      size: 1024 * 1024 * 20
    }
  };

  for (let user of users) {
    it(`renders JupyterButton for ${user.type} user`, () => {
      const div = document.createElement("div");
      // * fix for tooltips https://github.com/reactstrap/reactstrap/issues/773#issuecomment-357409863
      document.body.appendChild(div);
      const branches = { all: { standard: [] }, fetch: () => {} };
      ReactDOM.render(
        <MemoryRouter>
          <JupyterButton user={user.data} branches={branches} {...props} />
        </MemoryRouter>,
        div
      );
    });

    it(`renders ShowFile for ${user.type} user`, () => {
      const div = document.createElement("div");
      document.body.appendChild(div);
      ReactDOM.render(
        <MemoryRouter>
          <ShowFile user={user.data} {...props} />
        </MemoryRouter>,
        div
      );
    });

    for (let key of Object.keys(file)) {
      it(`renders FilePreview for ${user.type} user - case ${key}`, () => {
        const fileProps = file[key];
        const previewThreshold = props.params.PREVIEW_THRESHOLD;
        const div = document.createElement("div");
        document.body.appendChild(div);
        ReactDOM.render(
          <MemoryRouter>
            <FilePreview file={fileProps} previewThreshold={previewThreshold} />
          </MemoryRouter>,
          div
        );
      });
    }
  }
});

describe("rendering pdf -- console suppressed!", () => {
  beforeEach(() => {
    jest.spyOn(console, "log").mockImplementation(() => {});
    jest.spyOn(console, "error").mockImplementation(() => {});
  });

  const filePdf = {
    file_name: "text.pdf",
    // eslint-disable-next-line
    content: "JVBERi0xLjAKMSAwIG9iajw8L1BhZ2VzIDIgMCBSPj5lbmRvYmogMiAwIG9iajw8L0tpZHNbMyAwIFJdL0NvdW50IDE+PmVuZG9iaiAzIDAgb2JqPDwvTWVkaWFCb3hbMCAwIDMgM10+PmVuZG9iagp0cmFpbGVyPDwvUm9vdCAxIDAgUj4+Cg=="
  };

  it("renders FilePreview for pdf", () => {
    const previewThreshold = { PREVIEW_THRESHOLD: { soft: 1048576, hard: 10485760 } };
    const div = document.createElement("div");
    document.body.appendChild(div);
    ReactDOM.render(
      <MemoryRouter>
        <FilePreview file={filePdf} previewThreshold={previewThreshold} />
      </MemoryRouter>,
      div
    );
  });
});

describe("cell metadata messaging", () => {
  it("leaves cell metadata unmodified if not necessary", () => {
    const notebook = {
      cells: [
        {
          cell_type: "code",
          execution_count: 3,
          metadata: {},
          outputs: [
            {
              name: "stdout",
              output_type: "stream",
              text: ["show input\n"]
            }
          ],
          source: ['print("show input")']
        }
      ],
      metadata: {
        kernelspec: {
          display_name: "Python 3",
          language: "python",
          name: "python3"
        },
        language_info: {
          codemirror_mode: {
            name: "ipython",
            version: 3
          },
          file_extension: ".py",
          mimetype: "text/x-python",
          name: "python",
          nbconvert_exporter: "python",
          pygments_lexer: "ipython3",
          version: "3.7.4"
        }
      },
      nbformat: 4,
      nbformat_minor: 4
    };
    const result = tweakCellMetadata(notebook);
    expect(result).toEqual(notebook);
  });
  it("modifies the cells that are necessary", () => {
    const notebook = {
      cells: [
        {
          cell_type: "code",
          execution_count: 3,
          metadata: {},
          outputs: [
            {
              name: "stdout",
              output_type: "stream",
              text: ["show input\n"]
            }
          ],
          source: ['print("show input")']
        },
        {
          cell_type: "code",
          execution_count: 4,
          metadata: {
            jupyter: {
              source_hidden: true
            },
            papermill: {
              duration: 0.48317,
              end_time: "2020-03-31T08:27:03.045655",
              exception: false,
              start_time: "2020-03-31T08:27:02.562485",
              status: "completed"
            },
            tags: []
          },
          outputs: [
            {
              name: "stdout",
              output_type: "stream",
              text: ["hide input\n"]
            }
          ],
          source: ['print("hide input")']
        },
        {
          cell_type: "code",
          execution_count: 5,
          metadata: {
            hide_input: true,
            papermill: {
              duration: 0.48317,
              end_time: "2020-03-31T08:27:03.045655",
              exception: false,
              start_time: "2020-03-31T08:27:02.562485",
              status: "completed"
            },
            tags: []
          },
          outputs: [
            {
              name: "stdout",
              output_type: "stream",
              text: ["hide too\n"]
            }
          ],
          source: ['print("hide too")']
        }
      ],
      metadata: {
        kernelspec: {
          display_name: "Python 3",
          language: "python",
          name: "python3"
        },
        language_info: {
          codemirror_mode: {
            name: "ipython",
            version: 3
          },
          file_extension: ".py",
          mimetype: "text/x-python",
          name: "python",
          nbconvert_exporter: "python",
          pygments_lexer: "ipython3",
          version: "3.7.4"
        }
      },
      nbformat: 4,
      nbformat_minor: 4
    };
    const result = tweakCellMetadata(notebook);
    expect(result.cells[0]).toEqual(notebook.cells[0]);
    expect(notebook.cells[1].metadata.hide_input).toEqual(undefined);
    expect(result.cells[1].metadata.hide_input).toEqual(true);
  });

  const modeNotebook = {
    cells: [
      {
        cell_type: "code",
        execution_count: 3,
        metadata: {},
        outputs: [
          {
            name: "stdout",
            output_type: "stream",
            text: ["show input\n"]
          }
        ],
        source: ['print("show input")']
      },
      {
        cell_type: "code",
        execution_count: 4,
        metadata: {
          jupyter: {
            source_hidden: true
          },
          papermill: {
            duration: 0.48317,
            end_time: "2020-03-31T08:27:03.045655",
            exception: false,
            start_time: "2020-03-31T08:27:02.562485",
            status: "completed"
          },
          tags: []
        },
        outputs: [
          {
            name: "stdout",
            output_type: "stream",
            text: ["hide input\n"]
          }
        ],
        source: ['print("hide input")']
      },
      {
        cell_type: "code",
        execution_count: 5,
        metadata: {
          hide_input: true,
          papermill: {
            duration: 0.48317,
            end_time: "2020-03-31T08:27:03.045655",
            exception: false,
            start_time: "2020-03-31T08:27:02.562485",
            status: "completed"
          },
          tags: []
        },
        outputs: [
          {
            name: "stdout",
            output_type: "stream",
            text: ["hide too\n"]
          }
        ],
        source: ['print("hide too")']
      }
    ],
    metadata: {
      hide_input: true,
      kernelspec: {
        display_name: "Python 3",
        language: "python",
        name: "python3"
      },
      language_info: {
        codemirror_mode: {
          name: "ipython",
          version: 3
        },
        file_extension: ".py",
        mimetype: "text/x-python",
        name: "python",
        nbconvert_exporter: "python",
        pygments_lexer: "ipython3",
        version: "3.7.4"
      }
    },
    nbformat: 4,
    nbformat_minor: 4
  };

  it("handles default mode correctly", () => {
    const result = tweakCellMetadata(modeNotebook, NotebookSourceDisplayMode.DEFAULT);
    expect(result.cells[0]).toEqual(modeNotebook.cells[0]);
    expect(modeNotebook.cells[1].metadata.hide_input).toEqual(undefined);
    expect(result.cells[1].metadata.hide_input).toEqual(true);
  });
  it("handles hidden mode correctly", () => {
    const result = tweakCellMetadata(modeNotebook, NotebookSourceDisplayMode.HIDDEN);
    expect(modeNotebook.cells[0].metadata.hide_input).toEqual(undefined);
    expect(result.cells[0].metadata.hide_input).toEqual(true);
    expect(modeNotebook.cells[1].metadata.hide_input).toEqual(undefined);
    expect(result.cells[1].metadata.hide_input).toEqual(true);
  });
  it("handles shown mode correctly", () => {
    const result = tweakCellMetadata(modeNotebook, NotebookSourceDisplayMode.SHOWN);
    expect(modeNotebook.cells[0].metadata.hide_input).toEqual(undefined);
    expect(result.cells[0].metadata.hide_input).toEqual(false);
    expect(modeNotebook.cells[1].metadata.hide_input).toEqual(undefined);
    expect(result.cells[1].metadata.hide_input).toEqual(false);
    expect(modeNotebook.metadata.hide_input).toEqual(true);
    expect(result.metadata.hide_input).toEqual(false);
  });

  it("sanitizes input correctly", () => {
    const modelNotebook = {
      "cells": [
        {
          "cell_type": "code",
          "execution_count": 1,
          "id": "c8aec876-82cb-4ce9-9697-3f058f91a968",
          "metadata": {},
          "outputs": [],
          "source": [
            "from IPython.display import IFrame, display, HTML"
          ]
        },
        {
          "cell_type": "code",
          "execution_count": 2,
          "id": "36b265a7-1dd7-4a4e-9c98-e8399f696a65",
          "metadata": {},
          "outputs": [
            {
              "data": {
                "text/html": [
                  "<script>alert(\"hello!\")</script>"
                ],
                "text/plain": [
                  "<IPython.core.display.HTML object>"
                ]
              },
              "metadata": {},
              "output_type": "display_data"
            }
          ],
          "source": [
            "display(HTML('<script>alert(\"hello!\")</script>'))"
          ]
        },
        {
          "cell_type": "code",
          "execution_count": 3,
          "id": "7af4d628-78ce-4a2b-9e70-0f87420551f7",
          "metadata": {
            "tags": []
          },
          "outputs": [
            {
              "data": {
                "text/html": [
                  "<script>document.title = \"New Title\"</script>"
                ],
                "text/plain": [
                  "<IPython.core.display.HTML object>"
                ]
              },
              "metadata": {},
              "output_type": "display_data"
            },
            {
              "data": {
                "text/html": [
                  "\n",
                  "        <iframe\n",
                  "            width=\"100%\"\n",
                  "            height=\"2000\"\n",
                  "            src=\"https://fr.wikipedia.org/wiki/Main_Page\"\n",
                  "            frameborder=\"0\"\n",
                  "            allowfullscreen\n",
                  "        ></iframe>\n",
                  "        "
                ],
                "text/plain": [
                  "<IPython.lib.display.IFrame at 0x103e7e310>"
                ]
              },
              "execution_count": 3,
              "metadata": {},
              "output_type": "execute_result"
            }
          ],
          "source": [
            "display(HTML('<script>document.title = \"New Title\"</script>'))\n",
            "IFrame(src = \"https://fr.wikipedia.org/wiki/Main_Page\", width = \"100%\", height = 2000)"
          ]
        },
        {
          "cell_type": "code",
          "execution_count": 4,
          "id": "15e62d41-3199-451a-8850-e123ea9fbd5c",
          "metadata": {},
          "outputs": [
            {
              "data": {
                "text/html": [
                  "<h1>This header is fine</h1>"
                ],
                "text/plain": [
                  "<IPython.core.display.HTML object>"
                ]
              },
              "metadata": {},
              "output_type": "display_data"
            }
          ],
          "source": [
            "display(HTML(\"<h1>This header is fine</h1>\"))"
          ]
        },
        {
          "cell_type": "markdown",
          "id": "fc9a7746-d99e-491f-ac6a-83f99e9f8a35",
          "metadata": {},
          "source": [
            "# Some markdown\n",
            "\n",
            "This should render. Do you see the alert?\n",
            "\n",
            "<script>alert(\"hello\")</script>"
          ]
        }
      ],
      "metadata": {
        "kernelspec": {
          "display_name": "Python 3",
          "language": "python",
          "name": "python3"
        },
        "language_info": {
          "codemirror_mode": {
            "name": "ipython",
            "version": 3
          },
          "file_extension": ".py",
          "mimetype": "text/x-python",
          "name": "python",
          "nbconvert_exporter": "python",
          "pygments_lexer": "ipython3",
          "version": "3.9.5"
        }
      },
      "nbformat": 4,
      "nbformat_minor": 5
    };
    const notebook = sanitizeNotebook(modelNotebook);

    expect(notebook.cells[1].outputs[0].data["text/html"]).toEqual([""]);
    expect(notebook.cells.length).toEqual(modelNotebook.cells.length);
    const modifiedCells = [1, 2];
    notebook.cells.forEach((c, i) => {
      const orig = modelNotebook.cells[i];
      notebookCellOutputsMatch(c, orig, modifiedCells.includes(i));
    });
  });
});
