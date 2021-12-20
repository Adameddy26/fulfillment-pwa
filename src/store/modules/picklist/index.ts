import actions from './actions'
import getters from './getters'
import mutations from './mutations'
import { Module } from 'vuex'
import PicklistState from './PicklistState'
import RootState from '../../RootState'

const productModule: Module<PicklistState, RootState> = {
    namespaced: true,
    state: {
      size: 0
    },
    getters,
    actions,
    mutations,
}

export default productModule;