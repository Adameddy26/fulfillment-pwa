import { ActionTree } from 'vuex'
import RootState from '@/store/RootState'
import OrderState from './OrderState'
import emitter from '@/event-bus'
import { OrderService } from '@/services/OrderService'
import { hasError } from '@/utils'
import * as types from './mutation-types'
import { prepareOrderQuery } from '@/utils/solrHelper'
import { UtilService } from '@/services/UtilService'
import logger from '@/logger'


const actions: ActionTree<OrderState, RootState> = {
  async fetchInProgressOrdersAdditionalInformation({ commit, state }) {
    // getting all the orders from state
    const cachedOrders = JSON.parse(JSON.stringify(state.inProgress.list)); // maintaining cachedOrders as to prepare the orders payload
    let inProgressOrders = JSON.parse(JSON.stringify(state.inProgress.list)); // maintaining inProgreesOrders as update the orders information once information in fetched

    const requestParams = [];

    while(cachedOrders.length) {
      const picklistBinIds: Array<string> = [];
      const orderIds: Array<string> = [];

      // splitting the orders in batches to fetch the additional orders information
      const orders = cachedOrders.splice(0, process.env.VUE_APP_VIEW_SIZE)

      orders.map((order: any) => {
        picklistBinIds.push(order.picklistBinId)
        orderIds.push(order.orderId)
      })

      requestParams.push({ picklistBinIds, orderIds })
    }

    const shipmentIdResps = await Promise.all(requestParams.map((params) => UtilService.findShipmentIdsForOrders(params.picklistBinIds, params.orderIds)))
    let shipmentIdsForOrders = {} as any
    const shipmentIds = [] as any

    let shipmentPackagesByOrder = {} as any, itemInformationByOrder = {} as any, carrierPartyIdsByShipment = {} as any, carrierShipmentBoxType = {} as any

    for (const resp of shipmentIdResps) {
      // maintaining an object containing information of shipmentIds for each order
      shipmentIdsForOrders = {
        ...shipmentIdsForOrders,
        ...resp
      }

      // storing all the shipmentIds for all the orders in an array to use furthur
      const orderShipmentIds = [...Object.values(resp).flat()] as Array<string>
      shipmentIds.push(...Object.values(resp).flat())

      // TODO: handle case when shipmentIds is empty
      // https://stackoverflow.com/questions/28066429/promise-all-order-of-resolved-values
      const [shipmentPackagesByOrderInformation, itemInformationByOrderInformation, carrierPartyIdsByShipmentInformation] = await Promise.all([UtilService.findShipmentPackages(orderShipmentIds), UtilService.findShipmentItemInformation(orderShipmentIds), UtilService.findCarrierPartyIdsForShipment(orderShipmentIds)])

      // TODO: try fetching the carrierPartyIds when fetching packages information, as ShipmentPackageRouteSegDetail entity contain carrierPartyIds as well
      const carrierPartyIds = [...new Set(Object.values(carrierPartyIdsByShipmentInformation).map((carrierPartyIds: any) => carrierPartyIds.map((carrier: any) => carrier.carrierPartyId)).flat())]

      shipmentPackagesByOrder = {
        ...shipmentPackagesByOrder,
        ...shipmentPackagesByOrderInformation
      }

      itemInformationByOrder = {
        ...itemInformationByOrder,
        ...itemInformationByOrderInformation
      }

      carrierPartyIdsByShipment = {
        ...carrierPartyIdsByShipment,
        ...carrierPartyIdsByShipmentInformation
      }

      carrierShipmentBoxType = {
        ...carrierShipmentBoxType,
        ...await UtilService.findCarrierShipmentBoxType(carrierPartyIds)
      }
    }

    inProgressOrders = inProgressOrders.map((order: any) => {

      // if for an order shipment information is not available then returning the same order information again
      if(!shipmentIdsForOrders[order.orderId]) {
        return {
          ...order
        }
      }

      order.items.map((item: any) => {
        // fetching shipmentItemInformation for the current order item and then assigning the shipmentItemSeqId to item
        item.shipmentItemSeqId = itemInformationByOrder[item.orderId]?.find((shipmentItem: any) => shipmentItem.orderItemSeqId === item.orderItemSeqId)?.shipmentItemSeqId
        item.selectedBox = shipmentPackagesByOrder[item.orderId]?.find((shipmentPackage: any) => shipmentPackage.shipmentId === item.shipmentId)?.packageName
      })

      const orderItem = order.items[0];
      const carrierPartyIds = [...new Set(shipmentIds.map((id: any) => carrierPartyIdsByShipment[id]?.map((carrierParty: any) => carrierParty.carrierPartyId)).flat())]

      return {
        customerId: orderItem.customerId,
        customerName: orderItem.customerName,
        orderId: orderItem.orderId,
        orderDate: orderItem.orderDate,
        groupValue: orderItem.picklistBinId,
        picklistBinId: orderItem.picklistBinId,
        shipmentIds: shipmentIdsForOrders[orderItem.orderId],
        items: order.items,
        shipmentMethodTypeId: orderItem.shipmentMethodTypeId,
        shipmentMethodTypeDesc: orderItem.shipmentMethodTypeDesc,
        shipmentPackages: shipmentPackagesByOrder[orderItem.orderId],
        carrierPartyIds,
        shipmentBoxTypeByCarrierParty: carrierPartyIds.reduce((shipmentBoxType: any, carrierPartyId: any) => {
          if(shipmentBoxType[carrierPartyId]) {
            shipmentBoxType[carrierPartyId].push(carrierShipmentBoxType[carrierPartyId])
          } else {
            shipmentBoxType[carrierPartyId] = carrierShipmentBoxType[carrierPartyId]
          }

          return shipmentBoxType
        }, {})
      }
    })

    // updating the state with the updated orders information
    commit(types.ORDER_INPROGRESS_UPDATED, {orders: inProgressOrders, total: state.inProgress.total})
  },

  // get in-progress orders
  async findInProgressOrders ({ commit, dispatch, state }, payload = {}) {
    emitter.emit('presentLoader');
    let resp;
    let orders = [];
    let total = 0;

    const inProgressQuery = JSON.parse(JSON.stringify(state.inProgress.query))

    try {
      const params = {
        ...payload,
        queryString: inProgressQuery.queryString,
        viewSize: inProgressQuery.viewSize,
        queryFields: 'productId productName virtualProductName orderId search_orderIdentifications productSku customerId customerName goodIdentifications',
        sort: 'orderDate asc',
        groupBy: 'picklistBinId',
        filters: {
          picklistItemStatusId: { value: 'PICKITEM_PENDING' },
          '-fulfillmentStatus': { value: 'Rejected' },
          '-shipmentMethodTypeId': { value: 'STOREPICKUP' },
          facilityId: { value: this.state.user.currentFacility.facilityId },
          productStoreId: { value: this.state.user.currentEComStore.productStoreId }
        }
      }

      // preparing filters separately those are based on some condition
      if(inProgressQuery.selectedPicklists.length) {
        params.filters['picklistId'] = {value: inProgressQuery.selectedPicklists, op: 'OR'}
      }

      const orderQueryPayload = prepareOrderQuery(params)

      resp = await OrderService.findInProgressOrders(orderQueryPayload);
      if (resp.status === 200 && !hasError(resp) && resp.data.grouped?.picklistBinId.matches > 0) {
        total = resp.data.grouped.picklistBinId.ngroups
        orders = resp.data.grouped.picklistBinId.groups

        this.dispatch('product/getProductInformation', { orders })

        orders = orders.map((order: any) => {
          const orderItem = order.doclist.docs[0];
          return {
            customerId: orderItem.customerId,
            customerName: orderItem.customerName,
            orderId: orderItem.orderId,
            orderDate: orderItem.orderDate,
            groupValue: order.groupValue,
            picklistBinId: orderItem.picklistBinId,
            items: order.doclist.docs,
            shipmentMethodTypeId: orderItem.shipmentMethodTypeId,
            shipmentMethodTypeDesc: orderItem.shipmentMethodTypeDesc,
          }
        })
      } else {
        throw resp.data
      }
    } catch (err) {
      logger.error('No inProgress orders found', err)
    }

    inProgressQuery.viewSize = orders.length

    commit(types.ORDER_INPROGRESS_QUERY_UPDATED, { ...inProgressQuery })
    commit(types.ORDER_INPROGRESS_UPDATED, {orders, total})

    // fetching the additional information like shipmentRoute, carrierParty information
    dispatch('fetchInProgressOrdersAdditionalInformation')

    emitter.emit('dismissLoader');
    return resp;
  },
  
  // get open orders
  async findOpenOrders ({ commit, state }, payload = {}) {
    emitter.emit('presentLoader');
    let resp;

    const openOrderQuery = JSON.parse(JSON.stringify(state.open.query))

    const params = {
      ...payload,
      queryString: openOrderQuery.queryString,
      viewSize: openOrderQuery.viewSize,
      queryFields: 'orderId',
      filters: {
        quantityNotAvailable: { value: 0 },
        isPicked: { value: 'N' },
        '-shipmentMethodTypeId': { value: 'STOREPICKUP' },
        '-fulfillmentStatus': { value: 'Cancelled' },
        orderStatusId: { value: 'ORDER_APPROVED' },
        orderTypeId: { value: 'SALES_ORDER' },
        facilityId: { value: this.state.user.currentFacility.facilityId },
        productStoreId: { value: this.state.user.currentEComStore.productStoreId }
      }
    }

    // only adding shipmentMethods when a method is selected
    if(openOrderQuery.selectedShipmentMethods.length) {
      params.filters['shipmentMethodTypeId'] = { value: openOrderQuery.selectedShipmentMethods, op: 'OR' }
    }

    const orderQueryPayload = prepareOrderQuery(params)
    let orders = [];
    let total = 0;

    try {
      resp = await OrderService.findOpenOrders(orderQueryPayload);
      if (resp.status === 200 && !hasError(resp) && resp.data.grouped?.orderId.matches > 0) {
        total = resp.data.grouped.orderId.ngroups
        orders = resp.data.grouped.orderId.groups
        this.dispatch('product/getProductInformation', { orders })
      } else {
        throw resp.data
      }
    } catch (err) {
      logger.error('No outstanding orders found', err)
    }

    openOrderQuery.viewSize = orders.length

    commit(types.ORDER_OPEN_QUERY_UPDATED, { ...openOrderQuery })
    commit(types.ORDER_OPEN_UPDATED, {list: orders, total})

    emitter.emit('dismissLoader');
    return resp;
  },

  async findCompletedOrders ({ commit, state }, payload = {}) {
    emitter.emit('presentLoader');
    let resp;

    const completedOrderQuery = JSON.parse(JSON.stringify(state.completed.query))

    const params = {
      ...payload,
      queryString: completedOrderQuery.queryString,
      viewSize: completedOrderQuery.viewSize,
      queryFields: 'productId productName virtualProductName orderId search_orderIdentifications productSku customerId customerName goodIdentifications',
      groupBy: 'picklistBinId',
      sort: 'orderDate asc',
      filters: {
        picklistItemStatusId: { value: '(PICKITEM_PICKED OR (PICKITEM_COMPLETED AND itemShippedDate: [NOW/DAY TO NOW/DAY+1DAY]))' },
        '-shipmentMethodTypeId': { value: 'STOREPICKUP' },
        facilityId: { value: this.state.user.currentFacility.facilityId },
        productStoreId: { value: this.state.user.currentEComStore.productStoreId }
      }
    }

    if(completedOrderQuery.selectedCarrierPartyIds.length) {
      params.filters['manifestContentId'] = { value: completedOrderQuery.selectedCarrierPartyIds, op: 'OR' }
    }

    // only adding shipmentMethods when a method is selected
    if(completedOrderQuery.selectedShipmentMethods.length) {
      params.filters['shipmentMethodTypeId'] = { value: completedOrderQuery.selectedShipmentMethods, op: 'OR' }
    }

    const orderQueryPayload = prepareOrderQuery(params)
    let orders = [];
    let total = 0;
    let shipments = {} as any;
    let shipmentPackagesByOrder = {} as any;

    try {
      resp = await OrderService.findCompletedOrders(orderQueryPayload);
      if (resp.status === 200 && !hasError(resp) && resp.data.grouped?.picklistBinId.matches > 0) {
        total = resp.data.grouped.picklistBinId.ngroups
        orders = resp.data.grouped.picklistBinId.groups
        this.dispatch('product/getProductInformation', { orders })

        const picklistBinIds: Array<string> = [];
        const orderIds: Array<string> = [];

        orders.map((order: any) => {
          picklistBinIds.push(order.groupValue)
          orderIds.push(order.doclist.docs[0].orderId)
        })

        const shipmentIds: Array<string> = [];

        shipments = await UtilService.fetchShipmentsForOrders(picklistBinIds, orderIds);
        shipments.length && Object.values(shipments).map((shipmentInformation: any) => Object.values(shipmentInformation).map((shipment: any) => shipmentIds.push(shipment.shipmentId)))
        shipmentIds.length && (shipmentPackagesByOrder = await UtilService.fetchShipmentPackagesByOrders(shipmentIds))
      } else {
        throw resp.data
      }
    } catch (err) {
      logger.error('No completed orders found', err)
    }

    completedOrderQuery.viewSize = orders.length

    // Transforming the resp
    orders = orders.map((order: any) => {

      let missingLabelImage = false;
      const orderItem = order.doclist.docs[0]; // basic information for the order

      if(shipmentPackagesByOrder[orderItem.orderId]) {
        missingLabelImage = Object.keys(shipmentPackagesByOrder[orderItem.orderId]).length > 0
      }

      return {
        customerId: orderItem.customerId,
        customerName: orderItem.customerName,
        orderId: orderItem.orderId,
        orderDate: orderItem.orderDate,
        groupValue: order.groupValue,
        items: order.doclist.docs,
        shipmentId: orderItem.shipmentId,
        shipmentMethodTypeId: orderItem.shipmentMethodTypeId,
        shipmentMethodTypeDesc: orderItem.shipmentMethodTypeDesc,
        shipments: shipments[orderItem.orderId],
        missingLabelImage,
        shipmentPackages: shipmentPackagesByOrder[orderItem.orderId]  // ShipmentPackages information is required when performing retryShippingLabel action
      }
    })

    commit(types.ORDER_COMPLETED_QUERY_UPDATED, { ...completedOrderQuery })
    commit(types.ORDER_COMPLETED_UPDATED, {list: orders, total})

    emitter.emit('dismissLoader');
    return resp;
  },

  async clearOrders ({ commit }) {
    commit(types.ORDER_INPROGRESS_CLEARED)
    commit(types.ORDER_OPEN_CLEARED)
    commit(types.ORDER_COMPLETED_CLEARED)
  },

  async updateOpenQuery({ commit, dispatch }, payload) {
    commit(types.ORDER_OPEN_QUERY_UPDATED, payload)
    await dispatch('findOpenOrders');
  },

  async updateCompletedQuery({ commit, dispatch }, payload) {
    commit(types.ORDER_COMPLETED_QUERY_UPDATED, payload)
    await dispatch('findCompletedOrders');
  },

  async updateInProgressQuery({ commit, dispatch }, payload) {
    commit(types.ORDER_INPROGRESS_QUERY_UPDATED, payload)
    await dispatch('findInProgressOrders');
  }
}

export default actions;