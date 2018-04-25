var _ = require('underscore');
var Backbone = require('backbone');
var marked = require('marked');
var UIConfig = require('../../../../config/ui.json');
var TagConfig = require('../../../../config/tag');
var TaskListTemplate = require('../templates/task_list_template.html');
var TaskListItem = require('../templates/task_list_item.html');
var NoListItem = require('../templates/no_search_results.html');
var Pagination = require('../../../../components/pagination.html');
var TaskFilters = require('../templates/task_filters.html');

var TaskListView = Backbone.View.extend({
  events: {
    'click #search-button'                    : 'search',
    'change #stateFilters input'              : 'stateFilter',
    'change #timeFilters input'               : 'timeFilter',
    'change #locationFilters input'           : 'locationFilter',
    'click #select-all-statefilters'          : 'selectAllStateFilter',
    'click #select-all-timefilters'           : 'selectAllTimeFilter',
    'click #select-all-locationfilters'       : 'selectAllLocationFilter',
    'change #js-restrict-task-filter'         : 'agencyFilter',
    'click a.page'                            : 'clickPage',
    'click #search-tab-bar-filter'            : 'toggleFilter',
    'click .usajobs-search-filter-nav__back'  : 'toggleFilter',
  },

  initialize: function (options) {
    this.el = options.el;
    this.collection = options.collection;
    this.queryParams = options.queryParams;
    this.term = this.queryParams.search;
    this.filters = this.queryParams.filters ?
      JSON.parse(this.queryParams.filters) : { state: 'open' };
    this.userAgency = window.cache.currentUser ? window.cache.currentUser.agency : {};
    this.initAgencyFilter();
    this.taskFilteredCount = 0;
    this.appliedFilterCount = getAppliedFiltersCount(this.filters);
    $(window).resize(function () {
      if ($(window).width() < 991) {
        $('#task-filters').addClass('hide');
        $('#footer').addClass('hide');
        $('.usajobs-search-tab-bar__filters-default').attr('aria-hidden', 'false');
        $('.usajobs-search-tab-bar__filter-count-container').attr('aria-hidden', 'false');
        $('.usajobs-search-tab-bar__filters-expanded').attr('aria-expanded', true);
      } else {
        $('#task-filters').removeClass('hide');
        $('#title').toggleClass('hide', false);
        $('.navigation').toggleClass('hide', false);
        $('#main-content').toggleClass('hide', false);
        $('.find-people').toggleClass('hide', false);
        $('#footer').removeClass('hide');
        $('.usajobs-search-filter-nav').attr('aria-hidden', 'true');
        $('#search-tab-bar-filter').attr('aria-expanded', false);
        $('.usajobs-search-tab-bar__filters-default').attr('aria-hidden', 'true');
        $('.usajobs-search-tab-bar__filter-count-container').attr('aria-hidden', 'true');
        $('.usajobs-search-tab-bar__filters-expanded').attr('aria-expanded', false);
      }
    });
  },

  render: function () {
    var template = _.template(TaskListTemplate)({
      placeholder: 'Find opportunities by ',
      user: window.cache.currentUser,
      ui: UIConfig,
      agencyName: this.userAgency.name,
      term: this.term,
      filters: this.filters,
      taskFilteredCount: this.taskFilteredCount,
      appliedFilterCount: this.appliedFilterCount,
    });
    this.$el.html(template);
    this.$el.localize();
    this.fetchData();
    return this;
  },

  fetchData: function () {
    var self = this;
    self.collection.fetch({
      success: function (collection) {
        self.collection = collection;
        self.tasks = collection.chain()
          .pluck('attributes')
          .map( _.bind( parseTaskStatus, this ) )
          .filter( _.bind( filterTaskByAgency, self, self.agency ) )
          .filter( _.bind( filterTaskByTerm, self, self.term ) )
          .filter( _.bind( filterTaskByFilter, self, self.filters ) )
          .value();
        self.renderList(1);
      },
    });
  },

  renderFilters: function () {
    var compiledTemplate = _.template(TaskFilters)({
      placeholder: '',
      user: window.cache.currentUser,
      ui: UIConfig,
      agencyName: this.userAgency.name,
      term: this.term,
      filters: this.filters,
      taskFilteredCount: this.taskFilteredCount,
      appliedFilterCount: this.appliedFilterCount,
    });
    $('#task-filters').html(compiledTemplate);
     
  },

  renderList: function (page) {
    $('#search-results-loading').hide();
    $('#task-list').html('');
    this.taskFilteredCount = this.tasks.length;
    this.appliedFilterCount = getAppliedFiltersCount(this.filters);
    this.renderFilters();
        
    if (this.tasks.length === 0) {
      var settings = {
        ui: UIConfig,
      };
      compiledTemplate = _.template(NoListItem)(settings); 
      $('#task-list').append(compiledTemplate);
      $('#task-page').hide();
    } else {
      $('#search-tab-bar-filter-count').text(this.appliedFilterCount);
      var pageSize = 20;
      var start = (page - 1) * pageSize;
      var stop = page * pageSize;
      $('#task-list').append(this.tasks.slice(start, stop).map(function (task) {
        return this.renderItem(task);
      }.bind(this)));
      this.renderPagination({
        page: page,
        numberOfPages: Math.ceil(this.tasks.length/pageSize),
        pages: [],
      });
    }
  },

  renderItem: function (task) {
    var obj = task;
    obj.userId = obj.owner.id;
    var item = {
      item: obj,
      user: window.cache.currentUser,
      tagConfig: TagConfig,
      tagShow: ['location', 'skill', 'topic', 'task-time-estimate', 'task-time-required'],
    };
    if (task.tags) {
      item.tags = this.organizeTags(task.tags);
    } else {
      item.tags = [];
    }
    if (task.description) {
      item.item.descriptionHtml = marked(task.description);
    }
    return _.template(TaskListItem)(item);
  },

  clickPage: function (e) {
    if (e.preventDefault) e.preventDefault();
    this.renderList($(e.currentTarget).data('page'));
    window.scrollTo(0, 0);
  },

  renderPagination: function (data) {
    if(data.numberOfPages < 8) {
      for (var j = 1; j <= data.numberOfPages; j++)
        data.pages.push(j);
    } else if (data.page < 5) {
      data.pages = [1, 2, 3, 4, 5, 0, data.numberOfPages];
    } else if (data.page >= data.numberOfPages - 3) {
      data.pages = [1, 0];
      for (var i = data.numberOfPages - 4; i <= data.numberOfPages; i++)
        data.pages.push(i);
    } else {
      data.pages = [1, 0, data.page - 1, data.page, data.page + 1, 0, data.numberOfPages];
    }
    var pagination = _.template(Pagination)(data);
    $('#task-page').html(pagination);
    $('#task-page').show();
  },

  organizeTags: function (tags) {
    // put the tags into their types
    return _(tags).groupBy('type');
  },

  isAgencyChecked: function () {
    return !!$( '#js-restrict-task-filter:checked' ).length;
  },

  initAgencyFilter: function () {
    this.agency = { data: {} };
    if (this.queryParams.agency) {
      // TODO: ideally we would be able to query the API for agencies
      // and look up the name via the abbreviation. This is basically
      // a hack to determine whether the current user's agency matches
      // the abbreviation passed in the query string.
      this.agency.data.abbr = this.queryParams.agency;
      if (this.userAgency.name &&
          this.userAgency.name.indexOf('(' + this.agency.data.abbr + ')') >= 0) {
        this.agency.data.name = this.userAgency.name;
      } else {
        this.agency.data.name = this.agency.data.abbr;
      }
    } else if (this.isAgencyChecked()) {
      this.agency.data = this.userAgency;
    }
  },

  toggleFilter: function (e) {
    var filterTab = this.$('#search-tab-bar-filter');
    if (filterTab.attr('aria-expanded') === 'true') {
      $('#task-filters').toggleClass('hide', true);

      $(filterTab).attr('aria-expanded', false);
      $('.usajobs-search-tab-bar__filters-default').attr('aria-hidden', 'false');
      $('.usajobs-search-tab-bar__filter-count-container').attr('aria-hidden', 'false');
      $('.usajobs-search-tab-bar__filters-expanded').attr('aria-expanded', false);
      $('.usajobs-search-filter-nav').attr('aria-hidden', 'true');

      $('#title').toggleClass('hide', false);
      $('.navigation').toggleClass('hide', false);
      $('#main-content').toggleClass('hide', false);
      $('.find-people').toggleClass('hide', false);

    } else {
      $(filterTab).attr('aria-expanded', true);
      $('.usajobs-search-tab-bar__filters-default').attr('aria-hidden', 'true');
      $('.usajobs-search-tab-bar__filter-count-container').attr('aria-hidden', 'true');
      $('.usajobs-search-tab-bar__filters-expanded').attr('aria-expanded', true);
      $('.usajobs-search-filter-nav').attr('aria-hidden', 'false');

      $('#title').toggleClass('hide', true);
      $('.navigation').toggleClass('hide', true);
      $('#main-content').toggleClass('hide', true);
      $('.find-people').toggleClass('hide', true);
      $('#task-filters').toggleClass('hide', false);

    }
  },


  search: function () {
    this.filter(this.$('#search').val());
  },

  selectAllStateFilter: function () {
    var checkBoxes = $('#stateFilters input[type="checkbox"]');
    checkBoxes.prop('checked', !checkBoxes.prop('checked'));

    var states = _($('#stateFilters input:checked')).pluck('value');
    this.filter(undefined, { state: states }, { data: {} });
  },

  selectAllTimeFilter: function () {
    var checkBoxes = $('#timeFilters input[type="checkbox"]');
    checkBoxes.prop('checked', !checkBoxes.prop('checked'));

    var times = _($('#timeFilters input:checked')).pluck('value').map(function (value) {
      return { type: 'task-time-required', name: value };
    });
    this.filter(undefined, { tags: times }, { data: {} });
  },

  selectAllLocationFilter: function () {
    var checkBoxes = $('#locationFilters input[type="checkbox"]');
    checkBoxes.prop('checked', !checkBoxes.prop('checked'));

    var locations = _($('#locationFilters input:checked')).pluck('value');
    this.filter(undefined, { location: locations }, { data: {} });
  },

  stateFilter: function (event) {
    var states = _($('#stateFilters input:checked')).pluck('value');
    if ( this.isAgencyChecked() ) {
      this.filter( undefined, { state: states }, this.agency );
    } else {
      this.filter(undefined, { state: states }, { data: {} });
    }
  },

  timeFilter: function (event) {
    var times = _($('#timeFilters input:checked')).pluck('value').map(function (value) {
      return { type: 'task-time-required', name: value };
    });
    this.filter(undefined, { tags: times }, { data: {} });
  },

  locationFilter: function (event) {
    var times = _($('#locationFilters input:checked')).pluck('value');
    this.filter(undefined, { location: locations }, { data: {} });
  },

  agencyFilter: function (event) {
    var isChecked = event.target.checked;
    var states = _( $( '#stateFilters input:checked' ) ).pluck( 'value' );
    this.initAgencyFilter();
    if ( isChecked ) {
      this.filter( undefined, { state: states }, this.agency );
    } else {
      this.filter(undefined, { state: states }, { data: {} });
    }
  },

  filter: function (term, filters, agency) {
    if (typeof term !== 'undefined') this.term = term;
    if (typeof filters !== 'undefined') this.filters = filters;
    if (typeof agency !== 'undefined') this.agency = agency;
    this.tasks = this.collection.chain()
      .pluck('attributes')
      .map( _.bind( parseTaskStatus, this ) )
      .filter( _.bind( filterTaskByAgency, this, this.agency ) )
      .filter( _.bind( filterTaskByTerm, this, this.term ) )
      .filter( _.bind( filterTaskByFilter, this, this.filters ) )
      .value();
    
    //this.appliedFilterCount = filters.length;
    this.renderList(1);

    if ($('#search-tab-bar-filter').attr('aria-expanded') === 'true') {
      $('.usajobs-search-filter-nav').attr('aria-hidden', 'false');
    }
  },

  empty: function () {
    this.$el.html('');
  },

  cleanup: function () {
    removeView(this);
  },

});

function getAppliedFiltersCount (filters) {
  var count = 0;
  _.each(filters, function ( value, key ) {
    count += (_.isArray(value) ? value.length : 1);
  });
  return count;
}

function parseTaskStatus (task) {
  task.state = (task.state == 'in progress' && task.acceptingApplicants) ? 'open' : task.state;
  return task;
}

function filterTaskByAgency ( agency, task ) {
  var getAbbr = _.property( 'abbr' );

  if ( _.isEmpty( agency.data ) ) {
    return task;
  }

  if ( getAbbr( agency.data ) === getAbbr( task.restrict ) ) {
    return _.property( 'restrictToAgency' )( task.restrict ) || _.property( 'projectNetwork' )( task.restrict );
  }

}

function filterTaskByTerm ( term, task ) {
  var searchBody = JSON.stringify( _.values( task ) ).toLowerCase();
  return ( ! term ) || ( searchBody.indexOf( term.toLowerCase() ) >= 0 );
}

function filterTaskByFilter ( filters, task ) {
  var test = [];
  _.each( filters, function ( value, key ) {
    if ( _.isArray( value ) ) {
      test.push( _.some( value, function ( val ) {
        return task[ key ] === val || _.contains( task[ key ], value );
      } ) );
    } else {
      test.push( task[ key ] === value || _.contains( task[ key ], value ) );
    }
  } );
  return test.length === _.compact(test).length;
}

module.exports = TaskListView;
