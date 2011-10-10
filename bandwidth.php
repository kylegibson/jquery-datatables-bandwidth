<?
if(!isset($_GET["load"])) exit;
require_once('/home/frozen/phpcassa.php');

function get_date_format($period) {
  $formats = array(
    "monthly"  => "Y-m",
    "daily"    => "Y-m-d",
    "hourly"   => "Y-m-d.H"
    );
  if(array_key_exists($period, $formats))
    return $formats[$period];
  return "";
}

function get_date_step($period) {
  $steps = array(
    "monthly"  => "+1 month", 
    "daily"    => "+1 day", 
    "hourly"   => "+1 hour",
    );
  if(array_key_exists($period, $steps))
    return $steps[$period];
  return "";
}

function get_date_span($start, $stop, $period) {
  $format = get_date_format($period);
  $step = get_date_step($period);
  $dates = array();
  while($stop >= $start) {
    $dates[] = date($format, $start);
    $start = strtotime($step, $start);
  }
  return $dates;
}

function get_current($period) {
  return date(get_date_format($period));
}

$date_start = strtotime($_GET["date_start"]);
$date_stop = strtotime($_GET["date_stop"]);
$date_step = $_GET["date_step"];
$metric = $_GET["metric"];
$dates = get_date_span($date_start, $date_stop, $date_step);
$dates = array_reverse($dates);
$current = get_current($date_step);
try {
  $sys = new ColumnFamily(cassandra_connect("fo"), "systems");
  $agg = new ColumnFamily(cassandra_connect("metrics"), "agg");
  $sys->read_consistency_level = cassandra_ConsistencyLevel::ONE;
  $agg->read_consistency_level = cassandra_ConsistencyLevel::ONE;
  if($_GET["load"] == "all") {
    $systems = array();
    $r = $sys->get_range("", "", $row_count=200, $columns=array("status"));
    foreach($r as $system => $info) $systems[] = $system;
  } else {
    $systems = explode(",", $_GET["load"]);
  }
  $keys = array();
  $totals = array();
  foreach($systems as $system) {
    $totals[$system] = array();
    $keys["$system-$metric-$date_step"] = $system;
  }
  $result = $agg->multiget(array_keys($keys), $dates);
  foreach($result as $key => $xfer) {
    $system = $keys[$key];
    foreach($dates as $date) {
      $totals[$system][$date] = array_key_exists($date, $xfer) ? $xfer[$date] : "";
    }
  }
  if(in_array($current, $dates) && in_array($date_step, array("monthly", "daily"))) {
    $keys = array();
    $skeymap = array();
    if($date_step == "monthly") {
      $keys["daily"] = array();
      $keys["daily"]["map"] = array();
      $keys["daily"]["columns"] = get_date_span(strtotime("first day of this month"), time(), "daily");
    }
    $keys["hourly"] = array();
    $keys["hourly"]["map"] = array();
    $keys["hourly"]["columns"] = get_date_span(strtotime("today"), time(), "hourly");
    foreach($systems as $system) {
      $skeymap[$system] = array();
      foreach($keys as $key => &$instance) {
        $instance["map"]["$system-$metric-$key"] = $system;
        $skeymap[$system][$key] = "$system-$metric-$key";
      }
    }
    foreach($keys as $key => &$instance) {
      $instance["result"] = $agg->multiget(array_keys($instance["map"]), $instance["columns"]);
    }
    foreach($systems as $system) {
      $total = 0;
      foreach($keys as $key => &$instance) {
        $skey = $skeymap[$system][$key];
        $result = $instance["result"];
        if(array_key_exists($skey, $result)) {
          foreach($instance["columns"] as $column) {
            if(array_key_exists($column, $result[$skey])) {
              $total += intval($result[$skey][$column]);
            }
          }
        }
      }
      $totals[$system][$current] = strval($total);
    }
  }
  ob_start('ob_gzhandler');
  echo json_encode(array("columns" => $dates, "data" => $totals));
} catch(Exception $e) { 
  die("exception"); 
}
?>
