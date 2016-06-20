package models.street

import java.sql.Timestamp
import com.vividsolutions.jts.geom.LineString
import models.utils.MyPostgresDriver
import models.utils.MyPostgresDriver.simple._
import play.api.Play.current
import scala.slick.jdbc.{StaticQuery => Q, GetResult}

case class StreetEdge(streetEdgeId: Int, geom: LineString, source: Int, target: Int, x1: Float, y1: Float,
                      x2: Float, y2: Float, wayType: String, deleted: Boolean, timestamp: Option[Timestamp])

/**
 *
 */
class StreetEdgeTable(tag: Tag) extends Table[StreetEdge](tag, Some("sidewalk"), "street_edge") {
  def streetEdgeId = column[Int]("street_edge_id", O.PrimaryKey)
  def geom = column[LineString]("geom")
  def source = column[Int]("source")
  def target = column[Int]("target")
  def x1 = column[Float]("x1")
  def y1 = column[Float]("y1")
  def x2 = column[Float]("x2")
  def y2 = column[Float]("y2")
  def wayType = column[String]("way_type")
  def deleted = column[Boolean]("deleted", O.Default(false))
  def timestamp = column[Option[Timestamp]]("timestamp")

  def * = (streetEdgeId, geom, source, target, x1, y1, x2, y2, wayType, deleted, timestamp) <> ((StreetEdge.apply _).tupled, StreetEdge.unapply)
}


/**
 * Data access object for the street_edge table
 */
object StreetEdgeTable {
  // For plain query
  // https://github.com/tminglei/slick-pg/blob/slick2/src/test/scala/com/github/tminglei/slickpg/addon/PgPostGISSupportTest.scala
  import MyPostgresDriver.plainImplicits._

  implicit val streetEdgeConverter = GetResult[StreetEdge](r => {
    StreetEdge(r.nextInt, r.nextGeometry[LineString], r.nextInt, r.nextInt, r.nextFloat, r.nextFloat, r.nextFloat, r.nextFloat, r.nextString, r.nextBoolean, r.nextTimestampOption)
  })

  val db = play.api.db.slick.DB
  val streetEdges = TableQuery[StreetEdgeTable]
  val streetEdgeAssignmentCounts = TableQuery[StreetEdgeAssignmentCountTable]

  val streetEdgesWithoutDeleted = streetEdges.filter(_.deleted === false)

  /**
   * Returns a list of all the street edges
    *
    * @return A list of StreetEdge objects.
   */
  def all: List[StreetEdge] = db.withSession { implicit session =>
    streetEdgesWithoutDeleted.list
  }

  /**
    * This method returns the audit completion rate
    *
    * @param auditCount
    * @return
    */
  def auditCompletionRate(auditCount: Int): Float = db.withSession { implicit session =>
    val allEdges = streetEdgesWithoutDeleted.list

    val completedEdges = (for {
      (_streetEdges, _assignmentCounts) <- streetEdgesWithoutDeleted.innerJoin(streetEdgeAssignmentCounts).on(_.streetEdgeId === _.streetEdgeId)
      if _assignmentCounts.completionCount >= auditCount
    } yield _streetEdges).list

    completedEdges.length.toFloat / allEdges.length
  }

  /**
    * Get the audited distance in miles
    * Reference: http://gis.stackexchange.com/questions/143436/how-do-i-calculate-st-length-in-miles
    *
    * @param auditCount
    * @return
    */
  def auditedStreetDistance(auditCount: Int): Float = db.withSession { implicit session =>
    val distances = for {
      (_streetEdges, _assignmentCounts) <- streetEdgesWithoutDeleted.innerJoin(streetEdgeAssignmentCounts).on(_.streetEdgeId === _.streetEdgeId)
      if _assignmentCounts.completionCount >= auditCount
    } yield _streetEdges.geom.transform(26918).length
    (distances.list.sum * 0.000621371).toFloat
  }

  /**
    * Returns a list of street edges that are audited at least auditCount times
    *
    * @return
    */
  def auditedStreets(auditCount: Int): List[StreetEdge] = db.withSession { implicit session =>
    val edges = for {
      (_streetEdges, _assignmentCounts) <- streetEdgesWithoutDeleted.innerJoin(streetEdgeAssignmentCounts).on(_.streetEdgeId === _.streetEdgeId)
      if _assignmentCounts.completionCount >= auditCount
    } yield _streetEdges
    edges.list
  }

  def selectStreetsIn(minLat: Double, minLng: Double, maxLat: Double, maxLng: Double): List[StreetEdge] = db.withSession { implicit session =>

    // http://gis.stackexchange.com/questions/60700/postgis-select-by-lat-long-bounding-box
    // http://postgis.net/docs/ST_MakeEnvelope.html
    val selectEdgeQuery = Q.query[(Double, Double, Double, Double), StreetEdge](
      """SELECT st_e.street_edge_id, st_e.geom, st_e.source, st_e.target, st_e.x1, st_e.y1, st_e.x2, st_e.y2, st_e.way_type, st_e.deleted, st_e.timestamp
       |FROM sidewalk.street_edge AS st_e
       |WHERE st_e.deleted = FALSE AND ST_Intersects(st_e.geom, ST_MakeEnvelope(?, ?, ?, ?, 4326))""".stripMargin
    )

    val edges: List[StreetEdge] = selectEdgeQuery((minLng, minLat, maxLng, maxLat)).list
    edges
  }

  /**
   * Set a record's deleted column to true
   */
  def delete(id: Int) = db.withSession { implicit session =>
    streetEdges.filter(edge => edge.streetEdgeId === id).map(_.deleted).update(true)
  }

  /**
   * Save a StreetEdge into the street_edge table
    *
    * @param edge A StreetEdge object
   * @return
   */
  def save(edge: StreetEdge): Int = db.withTransaction { implicit session =>
    streetEdges += edge
    edge.streetEdgeId // return the edge id.
  }
}

