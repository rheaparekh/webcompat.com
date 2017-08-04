/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var issues = issues || {}; // eslint-disable-line no-use-before-define

// We need a complete list of labels for certain operations,
// especially namespace mapping. If the list we're handling
// doesn't happen to contain all the labels initially, it
// can't get prefixing/unprefixing right when labels in previously
// unseen namespaces are added in their local name form.
// Hence, we set up a single, globally accessible "all labels" model
// This is set up as early as possible to avoid timing issues
if (!issues.allLabels) {
  issues.allLabels = new issues.LabelList();
}

issues.LabelsView = Backbone.View.extend({
  _isLoggedIn: $("body").data("username"),
  el: $(".js-Issue-labels"),
  editorButton: null,
  events: {
    "click .js-LabelEditorLauncher:not(.is-active)": "editLabels",
    "click .js-LabelEditorLauncher.is-active": "closeEditor"
  },
  keyboardEvents: {
    l: "openLabelEditor"
  },
  openLabelEditor: function(e) {
    // make sure we're not typing in the search input.
    if (e.target.nodeName === "TEXTAREA") {
      return;
    } else {
      e.preventDefault();
      this.editLabels();
    }
  },
  template: wcTmpl["issue/issue-labels.jst"],
  // this subTemplate will need to be kept in sync with
  // relavant parts in issue/issue-labels.jst
  subTemplate: wcTmpl["issue/issue-labels-sub.jst"],
  render: function() {
    this.$el.html(this.template(this.model.toJSON()));
    this.fetchLabels();
    return this;
  },
  closeEditor: function() {
    this.labelEditor.closeEditor();
  },
  renderLabels: function() {
    this.$el.html(this.template(this.model.toJSON()));
  },
  fetchLabels: function() {
    this.editorButton = $(".js-LabelEditorLauncher");
    this.labelEditor = new issues.LabelEditorView({
      model: issues.allLabels,
      issueView: this
    });
    if (this._isLoggedIn) {
      this.issueLabels = this.getIssueLabels();
      this.editorButton.show();
    }
  },
  getIssueLabels: function() {
    return _.pluck(this.model.get("labels"), "name");
  },
  editLabels: function() {
    this.editorButton.addClass("is-active");
    this.$el
      .find(".js-LabelEditorLauncher")
      .after(this.labelEditor.render().el);
    var toBeChecked = _.intersection(
      this.getIssueLabels(),
      issues.allLabels.toArray()
    );
    _.each(toBeChecked, function(labelName) {
      $('[name="' + labelName + '"]').prop("checked", true);
    });
  }
});

issues.LabelEditorView = Backbone.View.extend({
  className: "wc-LabelEditor js-LabelEditor",
  events: {
    "change input[type=checkbox]": "updateView",
    "click button": "closeEditor",
    keyup: "closeEditor",
    "keyup .wc-LabelEditor-search": "filterLabels",
    "keyup .wc-LabelEditor-list-item": "checkUncheckLabels",
    "keydown .wc-LabelEditor-search": "focusSaveClose",
    "keydown .wc-LabelEditor-list-item": "removeFocus",
    "keydown .wc-LabelEditor-list-item:visible:last": "backToTop"
  },
  initialize: function(options) {
    this.issueView = options.issueView;
  },
  template: wcTmpl["web_modules/label-editor.jst"],
  render: function() {
    this.$el.html(this.template(this.model));
    this.resizeEditorHeight();
    _.defer(
      _.bind(function() {
        this.$el.find(".wc-LabelEditor-search").focus();
      }, this)
    );
    return this;
  },
  reRender: function(data) {
    //only re-render the labels into the labels wrapper
    this.issueView.$el
      .find(".js-Label-list")
      .html(this.issueView.subTemplate(data));
    this.issueView.$el.find(".js-LabelEditorLauncher").addClass("is-active");
  },
  resizeEditorHeight: function() {
    var getBreakpoint = function() {
      var style;
      var doResize = false;
      if (
        window.getComputedStyle &&
        window.getComputedStyle(document.body, "::after")
      ) {
        style = window.getComputedStyle(document.body, "::after").content;
      }
      if (style.match(/resizeEditor/)) {
        doResize = true;
      }
      return doResize;
    };

    if (getBreakpoint()) {
      _.defer(function() {
        var labelEditorheight = parseInt(
          $(".wc-LabelEditor").css("height"),
          10
        );
        var labelHeaderheight = parseInt(
          $(".wc-LabelEditor-header").css("height"),
          10
        );
        $(".wc-LabelEditor-list").height(labelEditorheight - labelHeaderheight);
        $("html, body").animate({ scrollTop: 0 }, 0);
      });
    }
  },
  updateView: function(evt) {
    // We try to make sure only one "status" or "priority"-type label is set
    // If the change event comes from a "status" or "priority"-type label,
    // enumerate all checked "status" or "priority"-type labels and uncheck
    // the others.
    var checked;
    var remotename = $(evt.target).data("remotename");
    if (remotename.match(/^(status|priority)/) && evt.target.checked) {
      var prefix = remotename.split("-")[0];
      checked = $(
        'input[type=checkbox][data-remotename^="' + prefix + '"]:checked'
      );
      _.each(checked, function(item) {
        if (item !== evt.target) {
          item.checked = false;
        }
      });
    }
    // we do the "real" save when you close the editor.
    // this just updates the UI responsively
    checked = $("input[type=checkbox]:checked");
    // build up an array of objects that have
    // .name and .color props that the templates expect
    var modelUpdate = [];
    _.each(checked, function(item) {
      //item already has a .name property
      item.color = $(item).data("color");
      modelUpdate.push(item);
    });
    this.reRender({ labels: _.uniq(modelUpdate) });
  },
  closeEditor: function(e) {
    if (!e || (e && (e.keyCode === 27 || !e.keyCode))) {
      var checked = $("input[type=checkbox]:checked");
      var labelsArray = _.pluck(checked, "name");
      this.issueView.editorButton.removeClass("is-active");
      this.issueView.model.updateLabels(labelsArray);
      // detach() (vs remove()) here because we don't want to lose events if the
      // user reopens the editor.
      this.$el.children().detach();
    }
  },
  filterLabels: _.debounce(function(e) {
    setTimeout(function() {
      if (e.keyCode === 13) {
        $(".wc-LabelEditor-list-item:visible:first").focus();
        // if you call the focus() function in a label element,'
        // the focus automatically goes to the input.
        // that's why we need to add the focused class.
        $(".wc-LabelEditor-list-item:visible:first").addClass("focused");
      }
    }, 100);

    var escape = function(s) {
      return s.replace(/[-\/\\^$*+?:.()|[\]{}]/g, "\\$&");
    };
    var re = new RegExp("^" + escape(e.target.value), "i");
    var toHide = _.filter(this.model.toArray(), function(label) {
      return !re.test(label);
    });

    // make sure everything is showing
    $(".wc-LabelEditor-list-item").show();

    // hide the non-filter matches
    _.each(toHide, function(name) {
      $("input[name=" + escape(name) + "]")
        .closest(".wc-LabelEditor-list-item")
        .hide();
    });
  }, 100),
  checkUncheckLabels: _.debounce(function(e) {
    if (e.keyCode === 13) {
      $(e.target).click().addClass("focused");
    }
  }, 100),
  focusSaveClose: _.debounce(function(e) {
    if (e.keyCode === 9) {
      // Safari workaround.
      $(".wc-LabelEditor-button.r-ResetButton").focus();
    }
  }, 1),
  removeFocus: _.debounce(function(e) {
    if (e.keyCode === 9) {
      $(e.target).closest("label").removeClass("focused");
    }
  }, 100),
  backToTop: _.debounce(function(e) {
    if (e.keyCode === 9) {
      this.$el.find(".wc-LabelEditor-search").focus();
    }
  }, 1)
});
