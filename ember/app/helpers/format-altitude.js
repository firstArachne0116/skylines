import Ember from 'ember';

export default Ember.Helper.extend({
  units: Ember.inject.service(),

  compute([value], options) {
    return this.get('units').formatAltitude(value, options);
  },
});
