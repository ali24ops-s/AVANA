/**
 * Preserved KnowledgeNetworkSection — forward-compatibility proxy.
 * Re-exports the FutureKnowledgeNetwork component.
 */

export {
  FutureKnowledgeNetwork,
  KnowledgeNetworkSection,
  NETWORK_NODES,
  DRUGS_NETWORK,
} from "../future/FutureKnowledgeNetwork.js";

export type {
  NetworkNode,
  DrugNetworkData,
} from "../future/FutureKnowledgeNetwork.js";
