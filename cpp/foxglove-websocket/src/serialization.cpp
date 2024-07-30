#include <foxglove/websocket/base64.hpp>
#include <foxglove/websocket/serialization.hpp>

namespace foxglove {

void to_json(nlohmann::json& j, const Channel& c) {
  j = {
    {"id", c.id},
    {"topic", c.topic},
    {"encoding", c.encoding},
    {"schemaName", c.schemaName},
    {"schema", c.schema},
  };

  if (c.schemaEncoding.has_value()) {
    j["schemaEncoding"] = c.schemaEncoding.value();
  }
}
void from_json(const nlohmann::json& j, Channel& c) {
  const auto it = j.find("schemaEncoding");
  const auto schemaEncoding = it == j.end() ? std::optional<std::string>(std::nullopt)
                                            : std::optional<std::string>(it->get<std::string>());

  ChannelWithoutId channelWithoutId{j["topic"].get<std::string>(), j["encoding"].get<std::string>(),
                                    j["schemaName"].get<std::string>(),
                                    j["schema"].get<std::string>(), schemaEncoding};
  c = Channel(j["id"].get<ChannelId>(), channelWithoutId);
}

void to_json(nlohmann::json& j, const ParameterValue& p) {
  const auto paramType = p.getType();
  if (paramType == ParameterType::PARAMETER_BOOL) {
    j = p.getValue<bool>();
  } else if (paramType == ParameterType::PARAMETER_INTEGER) {
    j = p.getValue<int64_t>();
  } else if (paramType == ParameterType::PARAMETER_DOUBLE) {
    j = p.getValue<double>();
  } else if (paramType == ParameterType::PARAMETER_STRING) {
    j = p.getValue<std::string>();
  } else if (paramType == ParameterType::PARAMETER_BYTE_ARRAY) {
    const auto& paramValue = p.getValue<std::vector<unsigned char>>();
    const std::string_view strValue(reinterpret_cast<const char*>(paramValue.data()),
                                    paramValue.size());
    j = base64Encode(strValue);
  } else if (paramType == ParameterType::PARAMETER_STRUCT) {
    j = p.getValue<std::unordered_map<std::string, ParameterValue>>();
  } else if (paramType == ParameterType::PARAMETER_ARRAY) {
    j = p.getValue<std::vector<ParameterValue>>();
  } else if (paramType == ParameterType::PARAMETER_NOT_SET) {
    // empty value.
  }
}

void from_json(const nlohmann::json& j, ParameterValue& p) {
  const auto jsonType = j.type();

  if (jsonType == nlohmann::detail::value_t::string) {
    p = ParameterValue(j.get<std::string>());
  } else if (jsonType == nlohmann::detail::value_t::boolean) {
    p = ParameterValue(j.get<bool>());
  } else if (jsonType == nlohmann::detail::value_t::number_integer) {
    p = ParameterValue(j.get<int64_t>());
  } else if (jsonType == nlohmann::detail::value_t::number_unsigned) {
    p = ParameterValue(j.get<int64_t>());
  } else if (jsonType == nlohmann::detail::value_t::number_float) {
    p = ParameterValue(j.get<double>());
  } else if (jsonType == nlohmann::detail::value_t::object) {
    p = ParameterValue(j.get<std::unordered_map<std::string, ParameterValue>>());
  } else if (jsonType == nlohmann::detail::value_t::array) {
    p = ParameterValue(j.get<std::vector<ParameterValue>>());
  }
}

void to_json(nlohmann::json& j, const Parameter& p) {
  to_json(j["value"], p.getValue());
  j["name"] = p.getName();
  if (p.getType() == ParameterType::PARAMETER_BYTE_ARRAY) {
    j["type"] = "byte_array";
  }
}

void from_json(const nlohmann::json& j, Parameter& p) {
  const auto name = j["name"].get<std::string>();

  if (j.find("value") == j.end()) {
    p = Parameter(name);  // Value is not set (undefined).
    return;
  }

  ParameterValue pValue;
  from_json(j["value"], pValue);

  if (j.find("type") != j.end() && j["type"] == "byte_array" &&
      pValue.getType() == ParameterType::PARAMETER_STRING) {
    p = Parameter(name, base64Decode(pValue.getValue<std::string>()));
  } else {
    p = Parameter(name, pValue);
  }
}

void to_json(nlohmann::json& j, const Service& service) {
  j = {
    {"id", service.id},
    {"name", service.name},
    {"type", service.type},
  };

  if (service.request) {
    j["request"] = *service.request;
  }
  if (service.response) {
    j["response"] = *service.response;
  }
  if (service.requestSchema) {
    j["requestSchema"] = *service.requestSchema;
  }
  if (service.responseSchema) {
    j["responseSchema"] = *service.responseSchema;
  }
}

void from_json(const nlohmann::json& j, Service& p) {
  p.id = j["id"].get<ServiceId>();
  p.name = j["name"].get<std::string>();
  p.type = j["type"].get<std::string>();

  if (const auto it = j.find("request"); it != j.end()) {
    p.request = it->get<ServiceRequestDefinition>();
  }

  if (const auto it = j.find("response"); it != j.end()) {
    p.response = it->get<ServiceResponseDefinition>();
  }

  if (const auto it = j.find("requestSchema"); it != j.end()) {
    p.requestSchema = it->get<std::string>();
  }

  if (const auto it = j.find("responseSchema"); it != j.end()) {
    p.responseSchema = it->get<std::string>();
  }
}

void to_json(nlohmann::json& j, const ServiceRequestDefinition& r) {
  j = {
    {"encoding", r.encoding},
    {"schemaName", r.schemaName},
    {"schemaEncoding", r.schemaEncoding},
    {"schema", r.schema},
  };
}

void from_json(const nlohmann::json& j, ServiceRequestDefinition& r) {
  r.encoding = j["encoding"].get<std::string>();
  r.schemaName = j["schemaName"].get<std::string>();
  r.schemaEncoding = j["schemaEncoding"].get<std::string>();
  r.schema = j["schema"].get<std::string>();
}

void ServiceResponse::read(const uint8_t* payload, size_t payloadSize) {
  size_t offset = 0;
  this->serviceId = ReadUint32LE(payload + offset);
  offset += 4;
  this->callId = ReadUint32LE(payload + offset);
  offset += 4;
  const size_t encondingLength = static_cast<size_t>(ReadUint32LE(payload + offset));
  offset += 4;
  this->encoding = std::string(reinterpret_cast<const char*>(payload + offset), encondingLength);
  offset += encondingLength;
  const auto dataSize = payloadSize - offset;
  this->data.resize(dataSize);
  std::memcpy(this->data.data(), payload + offset, dataSize);
}

void ServiceResponse::write(uint8_t* payload) const {
  size_t offset = 0;
  foxglove::WriteUint32LE(payload + offset, this->serviceId);
  offset += 4;
  foxglove::WriteUint32LE(payload + offset, this->callId);
  offset += 4;
  foxglove::WriteUint32LE(payload + offset, static_cast<uint32_t>(this->encoding.size()));
  offset += 4;
  std::memcpy(payload + offset, this->encoding.data(), this->encoding.size());
  offset += this->encoding.size();
  std::memcpy(payload + offset, this->data.data(), this->data.size());
}

}  // namespace foxglove
