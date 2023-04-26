import { api, client } from '@/adapter';
import logger from '@/logger';
import store from '@/store';
import { hasError } from '@/utils';

const fetchShipmentMethods = async (query: any): Promise <any>  => {
  return api({
    url: "solr-query", 
    method: "post",
    data: query
  });
}

const fetchPicklistInformation = async (query: any): Promise <any>  => {
  return api({
    url: "performFind",
    method: "get",
    params: query
  });
}

const findShipmentIdsForOrders = async(picklistBinIds: Array<string>, orderIds: Array<string>): Promise<any> => {
  let shipmentIdsForOrders = {};

  const params = {
    "entityName": "Shipment",
    "inputFields": {
      "primaryOrderId": orderIds,
      "primaryOrderId_op": "in",
      "picklistBinId": picklistBinIds,
      "picklistBinId_op": "in",
      "originFacilityId": store.state.user.currentFacility.facilityId,
      "statusId": ["SHIPMENT_APPROVED", "SHIPMENT_INPUT"],
      "statusId_op": "in"
    },
    "fieldList": ["shipmentId", "primaryOrderId"],
    "viewSize": (orderIds.length * picklistBinIds.length) + 1,  // maximum records we have for orders
    "distinct": "Y"
  }

  try {
    // TODO: handle case when viewSize is more than 250 as performFind api does not return more than 250 records at once
    const resp = await api({
      url: "performFind",
      method: "get",
      params
    })

    if(resp.status == 200 && !hasError(resp) && resp.data.count) {
      shipmentIdsForOrders = resp.data.docs.reduce((shipmentIdsForOrders: any, shipment: any) => {
        if(shipmentIdsForOrders[shipment.primaryOrderId]) {
          shipmentIdsForOrders[shipment.primaryOrderId].push(shipment.shipmentId)
        } else {
          shipmentIdsForOrders[shipment.primaryOrderId] = [shipment.shipmentId]
        }
        return shipmentIdsForOrders
      }, {})
    } else {
      throw resp.data
    }
  } catch(err) {
    logger.error('Failed to fetch shipmentIds for orders', err)
  }

  return shipmentIdsForOrders;
}

const fetchShipmentsForOrders = async(picklistBinIds: Array<string>, orderIds: Array<string>, statusId = ["SHIPMENT_SHIPPED", "SHIPMENT_PACKED"]): Promise<any> => {
  let shipments = [];

  const params = {
    "entityName": "Shipment",
    "inputFields": {
      "primaryOrderId": orderIds,
      "primaryOrderId_op": "in",
      "picklistBinId": picklistBinIds,
      "picklistBinId_op": "in",
      "originFacilityId": store.state.user.currentFacility.facilityId,
      "statusId": statusId,
      "statusId_op": "in"
    },
    "fieldList": ["primaryOrderId", "shipmentId", "shipmentMethodTypeId", "statusId", "shipmentTypeId"],
    "viewSize": (orderIds.length * picklistBinIds.length) + 1,  // maximum records we have for orders
    "distinct": "Y"
  }

  try {
    // TODO: handle case when viewSize is more than 250 as performFind api does not return more than 250 records at once
    const resp = await api({
      url: "performFind",
      method: "get",
      params
    })

    if(resp.status == 200 && !hasError(resp) && resp.data.count) {
      shipments = resp.data.docs.reduce((shipmentInformation: any, shipment: any) => {
        if(shipmentInformation[shipment.primaryOrderId]) {
          shipmentInformation[shipment.primaryOrderId][shipment.shipmentId] = shipment
        } else {
          shipmentInformation[shipment.primaryOrderId] = {
            [shipment.shipmentId]: shipment
          }
        }

        return shipmentInformation
      }, {})
    } else {
      throw resp.data
    }
  } catch(err) {
    logger.error('Failed to fetch shipments for orders', err)
  }

  return shipments;
}

const findShipmentPackages = async(shipmentIds: Array<string>): Promise<any> => {
  let shipmentPackages = {};
  const params = {
    "entityName": "ShipmentPackageRouteSegDetail",
    "inputFields": {
      "shipmentId": shipmentIds,
      "shipmentId_op": "in"
    },
    "fieldList": ["shipmentId", "shipmentPackageSeqId", "shipmentBoxTypeId", "packageName", "primaryOrderId", "carrierPartyId"],
    "viewSize": shipmentIds.length,
    "distinct": "Y"
  }

  try {
    const resp = await api({
      url: "performFind",
      method: "get",
      params
    })

    if(resp.status == 200 && !hasError(resp) && resp.data.count) {
      shipmentPackages = resp.data.docs.reduce((shipmentForOrders: any, shipmentPackage: any) => {
        if(shipmentForOrders[shipmentPackage.primaryOrderId]) {
          shipmentForOrders[shipmentPackage.primaryOrderId].push(shipmentPackage)
        } else {
          shipmentForOrders[shipmentPackage.primaryOrderId] = [shipmentPackage]
        }
        return shipmentForOrders
      }, {})
    } else {
      throw resp.data
    }
  } catch(err) {
    logger.error('Failed to fetch shipment packages information', err)
  }

  return shipmentPackages;
}

const fetchShipmentPackagesByOrders = async(shipmentIds: Array<string>): Promise<any> => {
  let shipmentPackages = {};
  const params = {
    "entityName": "ShipmentPackageRouteSegDetail",
    "inputFields": {
      "shipmentId": shipmentIds,
      "shipmentId_op": "in",
      "trackingCode_op": "empty",
      "shipmentItemSeqId_op": "not-empty"
    },
    "fieldList": ["shipmentId", "shipmentPackageSeqId", "shipmentBoxTypeId", "packageName", "primaryOrderId", "carrierPartyId"],
    "viewSize": shipmentIds.length,
    "distinct": "Y"
  }

  try {
    const resp = await api({
      url: "performFind",
      method: "get",
      params
    })

    if(resp.status == 200 && !hasError(resp) && resp.data.count) {
      shipmentPackages = resp.data.docs.reduce((shipmentPackagesInformation: any, shipmentPackage: any) => {
        if(shipmentPackagesInformation[shipmentPackage.primaryOrderId]) {
          shipmentPackagesInformation[shipmentPackage.primaryOrderId][shipmentPackage.shipmentId] = shipmentPackage
        } else {
          shipmentPackagesInformation[shipmentPackage.primaryOrderId] = {
            [shipmentPackage.shipmentId]: shipmentPackage
          }
        }

        return shipmentPackagesInformation
      }, {})
    } else {
      throw resp.data
    }
  } catch(err) {
    logger.error('Failed to fetch shipment packages information', err)
  }

  return shipmentPackages;
}

const findCarrierPartyIdsForShipment = async(shipmentIds: Array<string>): Promise<any> => {
  let carrierPartyIdsByShipment = {};
  const params = {
    "entityName": "ShipmentRouteSegment",
    "inputFields": {
      "shipmentId": shipmentIds,
      "shipmentId_op": "in"
    },
    "fieldList": ["carrierPartyId", "shipmentId"],
    "viewSize": shipmentIds.length, // TODO: check about the maximum carriers available for a shipment
  }

  try {
    const resp = await api({
      url: "performFind",
      method: "get",
      params
    })

    if(resp.status == 200 && !hasError(resp) && resp.data.count) {
      carrierPartyIdsByShipment = resp.data.docs.reduce((carrierPartyIdsByShipment: any, shipment: any) => {
        if(carrierPartyIdsByShipment[shipment.shipmentId]) {
          carrierPartyIdsByShipment[shipment.shipmentId].push(shipment)
        } else {
          carrierPartyIdsByShipment[shipment.shipmentId] = [shipment]
        }
        return carrierPartyIdsByShipment
      }, {})
    } else {
      throw resp.data
    }
  } catch(err) {
    logger.error('Failed to fetch carrierPartyIds for shipment', err)
  }

  return carrierPartyIdsByShipment;
}

const findCarrierShipmentBoxType = async(carrierPartyIds: Array<string>): Promise<any> => {
  let shipmentBoxType = {}
  const params = {
    "entityName": "CarrierShipmentBoxType",
    "inputFields": {
      "partyId": carrierPartyIds,
      "partyId_op": "in"
    },
    "fieldList": ["shipmentBoxTypeId", "partyId"],
    "viewSize": carrierPartyIds.length,
  }

  try {
    const resp = await api({
      url: "performFind",
      method: "get",
      params,
      cache: true
    })

    if(resp.status == 200 && !hasError(resp) && resp.data.count) {
      shipmentBoxType = resp.data.docs.reduce((shipmentBoxTypes: any, boxType: any) => {
        if(shipmentBoxTypes[boxType.partyId]) {
          shipmentBoxTypes[boxType.partyId].push(boxType.shipmentBoxTypeId)
        } else {
          shipmentBoxTypes[boxType.partyId] = [boxType.shipmentBoxTypeId]
        }
        return shipmentBoxTypes
      }, {})
    } else {
      throw resp.data
    }
  } catch(err) {
    logger.error('Failed to fetch carrier shipment box type information', err)
  }

  return shipmentBoxType;
}

const findShipmentItemInformation = async(shipmentIds: Array<string>): Promise<any> => {
  let shipmentItemsInformation = {}
  const params = {
    "entityName": "OrderShipment",
    "inputFields": {
      "shipmentId": shipmentIds,
      "shipmentId_op": "in"
    },
    "fieldList": ["shipmentItemSeqId", "orderItemSeqId", "orderId", "shipmentId"],
    "viewSize": shipmentIds.length * 5, // TODO: check what should be the viewSize here
  }

  try {
    const resp = await api({
      url: "performFind",
      method: "get",
      params
    })

    if(resp.status == 200 && !hasError(resp) && resp.data.count) {
      shipmentItemsInformation = resp.data.docs.reduce((shipmentItems: any, shipmentItem: any) => {
        if(shipmentItems[shipmentItem.orderId]) {
          shipmentItems[shipmentItem.orderId].push(shipmentItem)
        } else {
          shipmentItems[shipmentItem.orderId] = [shipmentItem]
        }
        return shipmentItems
      }, {})
    } else {
      throw resp.data
    }
  } catch(err) {
    logger.error('Failed to fetch shipmentItem information', err)
  }

  return shipmentItemsInformation;
}

const fetchShipmentRouteSegmentInformation = async(query: any) : Promise<any> => {
  return api({
    url: "performFind",
    method: "get",
    params: query
  })
}

const fetchDefaultShipmentBox = async(query: any) : Promise<any> => {
  return api({
    url: "performFind",
    method: "get",
    params: query,
    cache: true
  })
}

const fetchRejectReasons = async(query: any): Promise<any> => {
  return api({
    url: "performFind",
    method: "get", // TODO: cache this api request
    params: query,
    cache: true
  })
}

const getAvailablePickers = async (query: any): Promise <any> => {
  return api({
    url: 'performFind',
    method: 'get',
    params: query,
    cache: true
  })
}

const createPicklist = async (query: any): Promise <any> => {
  let baseURL = store.getters['user/getInstanceUrl'];
  baseURL = baseURL && baseURL.startsWith('http') ? baseURL : `https://${baseURL}.hotwax.io/api/`;
  return client({
    url: 'createPicklist',
    method: 'POST',
    data: query,
    baseURL,
    headers: { "Content-Type": "multipart/form-data" },
  })
}

const fetchCarrierPartyIds = async (query: any): Promise <any>  => {
  return api({
    url: "solr-query",
    method: "post",
    data: query
  });
}

export const UtilService = {
  createPicklist,
  fetchCarrierPartyIds,
  findCarrierPartyIdsForShipment,
  findCarrierShipmentBoxType,
  fetchDefaultShipmentBox,
  fetchPicklistInformation,
  fetchRejectReasons,
  fetchShipmentsForOrders,
  fetchShipmentPackagesByOrders,
  findShipmentIdsForOrders,
  findShipmentItemInformation,
  fetchShipmentMethods,
  findShipmentPackages,
  fetchShipmentRouteSegmentInformation,
  getAvailablePickers
}