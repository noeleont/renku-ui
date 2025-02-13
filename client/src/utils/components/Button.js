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
/**
 *  renku-ui
 *
 *  Button.js
 *  Button code and presentation.
 */

import React, { Fragment, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faEllipsisV, faSyncAlt } from "@fortawesome/free-solid-svg-icons";
import { Link } from "react-router-dom";
import { Button, ButtonDropdown, DropdownToggle, DropdownMenu, UncontrolledTooltip, Col } from "reactstrap";
import { simpleHash } from "../helpers/HelperFunctions";

/**
 * A button with a menu (dropdown button)
 *
 * @param {component} [default] - The main, default item to show
 * @param {[DropdownItem]} [children] - The items to show in the menu
 */
function ButtonWithMenu(props) {
  const [dropdownOpen, setOpen] = useState(false);
  const toggleOpen = () => setOpen(!dropdownOpen);
  const size = (props.size) ? props.size : "md";

  return <ButtonDropdown
    className={props.className}
    size={size}
    isOpen={dropdownOpen}
    toggle={toggleOpen}
    color={props.color || "primary"}
    direction={props.direction}
    disabled={props.disabled}
  >
    {props.default}
    <DropdownToggle data-cy="more-menu" color={props.color || "primary"}>
      <FontAwesomeIcon icon={faEllipsisV}/>
    </DropdownToggle>
    <DropdownMenu end>
      {props.children}
    </DropdownMenu>
  </ButtonDropdown>;
}

/**
 * Refresh button with spinning icon.
 *
 * @param {function} props.action - function to trigger when clicking on the button
 * @param {boolean} [props.updating] - pilot the spin, should be true when performing the action
 * @param {boolean} [props.message] - tooltip message to trigger on hover
 */
function RefreshButton(props) {
  const id = "button_" + simpleHash(props.action.toString());
  const tooltip = props.message ?
    (<UncontrolledTooltip key="tooltip" placement="top" target={id}>{props.message}</UncontrolledTooltip>) :
    null;

  return (
    <Fragment>
      <Button key="button" className="ms-2 p-0" color="link" size="sm" id={id} onClick={() => props.action()}>
        <FontAwesomeIcon icon={faSyncAlt} spin={props.updating} />
      </Button>
      {tooltip}
    </Fragment>
  );
}

/**
 *
 * @param {string} props.url url to go back to
 * @param {string} props.label text next to the arrow
 */
function GoBackButton({ className, label, url }) {

  const linkClasses = (className) ?
    className + " link-rk-text text-decoration-none" :
    "link-rk-text text-decoration-none";

  return <Col md={12} className="pb-4 pl-0">
    <Link data-cy="go-back-button" className={linkClasses} to={url}>
      <span className="arrow-left">  </span>{label}
    </Link>
  </Col>;
}

export { RefreshButton, ButtonWithMenu, GoBackButton };
